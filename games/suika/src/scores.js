export const validScore = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 2147483647 ? Number(value) : 0;

// One key per identity prevents a shared browser from mixing different accounts.
export class ScoreStore {
    constructor({ storage, client = null, onChange = () => {}, onIdentity = () => {}, online = () => navigator.onLine } = {}) {
        this.storage = storage; this.client = client; this.onChange = onChange; this.onIdentity = onIdentity; this.online = online;
        this.scope = 'guest'; this.user = null; this.memory = new Map(); this.epoch = 0;
        this.running = new Set(); this.retryMs = 2000; this.timer = null; this.storageFailed = !storage;
        this.emit('游客 · 最高分保存在此设备');
    }
    get key() { return 'personal-space-suika-best-v1:' + this.scope; }
    get best() {
        let saved = 0;
        try { saved = validScore(this.storage?.getItem(this.key)); } catch { this.storageFailed = true; }
        return Math.max(saved, this.memory.get(this.scope) || 0);
    }
    emit(message = this.message) {
        this.message = message;
        this.onChange({ best: this.best, message: this.storageFailed ? '浏览器存储不可用 · 本次成绩仅在当前页面保留' : message });
    }
    save(score) {
        const best = Math.max(this.best, validScore(score));
        this.memory.set(this.scope, best);
        try { this.storage?.setItem(this.key, String(best)); } catch { this.storageFailed = true; }
        return best;
    }
    record(score) {
        if (validScore(score) <= this.best) return;
        this.save(score);
        this.emit(this.user ? '最高分已保存 · 等待云同步' : '游客 · 最高分保存在此设备');
        this.schedule(800);
    }
    setUser(user) {
        const reliable = user?.id && !user.is_anonymous ? user : null;
        const scope = reliable?.id || 'guest';
        if (scope !== this.scope) {
            this.epoch++; this.user = reliable; this.scope = scope;
            clearTimeout(this.timer); this.timer = null; this.retryMs = 2000;
            this.onIdentity(scope);
        } else this.user = reliable;
        this.emit(this.user ? '正在读取个人云端纪录…' : '游客 · 最高分保存在此设备');
        if (this.user) this.schedule(0);
    }
    schedule(ms) {
        if (!this.client || !this.user) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = null; void this.sync(); }, ms);
    }
    async sync() {
        if (!this.client || !this.user) return;
        const epoch = this.epoch, id = this.user.id;
        if (this.running.has(epoch)) { this.schedule(1000); return; }
        if (!this.online()) { this.emit('离线 · 已保留本地纪录，联网后自动同步'); this.schedule(this.retryMs); return; }
        this.running.add(epoch);
        try {
            const result = await this.client.from('suika_scores').select('best_score').eq('user_id', id).maybeSingle().abortSignal(AbortSignal.timeout(10000));
            if (result.error) throw result.error;
            if (this.epoch !== epoch) return;
            const remote = validScore(result.data?.best_score);
            const best = this.save(remote);
            let confirmed = remote;
            if (best > remote) {
                const write = await this.client.from('suika_scores').upsert({ user_id: id, best_score: best }, { onConflict: 'user_id' }).select('best_score').single().abortSignal(AbortSignal.timeout(10000));
                if (write.error) throw write.error;
                if (this.epoch !== epoch) return;
                confirmed = validScore(write.data?.best_score);
                this.save(confirmed);
            }
            this.retryMs = 2000;
            this.emit('个人最高分已与云端同步');
            if (this.best > confirmed) this.schedule(800);
        } catch (error) {
            if (this.epoch !== epoch) return;
            this.emit(['42P01', 'PGRST205'].includes(error.code) ? '本地已保存 · 云端成绩表尚未启用' : '本地已保存 · 云同步暂不可用，将自动重试');
            this.schedule(this.retryMs);
            this.retryMs = Math.min(60000, this.retryMs * 2);
        } finally { this.running.delete(epoch); }
    }
    destroy() { clearTimeout(this.timer); }
}
