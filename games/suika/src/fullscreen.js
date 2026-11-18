// Native fullscreen where available; a full-window layout on unsupported browsers.
export function initFullscreen(element, button, doc = document) {
    const nativeElement = () => doc.fullscreenElement || doc.webkitFullscreenElement;
    const active = () => nativeElement() === element || element.classList.contains('is-expanded');
    const update = () => {
        element.classList.toggle('is-fullscreen', nativeElement() === element);
        button.textContent = active() ? '⛶ 退出全屏' : '⛶ 全屏';
        button.setAttribute('aria-pressed', String(active()));
        button.setAttribute('aria-label', active() ? '退出游戏全屏' : '游戏全屏');
        button.title = active() ? '退出全屏（Esc）' : '游戏全屏';
    };
    const expanded = value => {
        element.classList.toggle('is-expanded', value);
        doc.body.classList.toggle('game-expanded', value);
        update();
    };
    button.addEventListener('click', async () => {
        try {
            if (nativeElement() === element) {
                await (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
            } else if (element.classList.contains('is-expanded')) {
                expanded(false);
            } else {
                const request = element.requestFullscreen || element.webkitRequestFullscreen;
                if (request && doc.fullscreenEnabled !== false) await request.call(element);
                else expanded(true);
            }
        } catch {
            if (!nativeElement()) expanded(!element.classList.contains('is-expanded'));
        }
        update();
    });
    doc.addEventListener('fullscreenchange', update);
    doc.addEventListener('webkitfullscreenchange', update);
    doc.addEventListener('keydown', event => {
        if (event.key === 'Escape' && element.classList.contains('is-expanded')) expanded(false);
    });
    update();
}
