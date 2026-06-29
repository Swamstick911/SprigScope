export const GH_URL = 'https://github.com/Swamstick911/SprigScope';

export function mountLanding(root: HTMLElement, onStart: () => void): void {
    root.innerHTML = `
        <div class="landing">
            <header class="topbar">
                <span class="logo">Sprig<b>Scope</b></span>
            </header>
            <div class="stars" aria-hidden="true"></div>
            <div class="hero">
                <h1 class="hero-title">Don't have a Sprig?<br>No Problem!</h1>
                <p class="hero-sub">Have some fun with a digital version of it <br>(obv with some limitations)</p>
                <div class="hero-actions">
                    <button class="btn primary" id="get-started">Get Started</button>
                    <a class="btn secondary" href="${GH_URL}" target="_blank" rel="noopener>GitHub</a>
                </div>
            </div>
            <div class="model-slot" aria-hidden="true">preview goes here</div>
            <div class="orpheus" aria-hidden="true"></div>
            <footer class="foot">Made by a Hackclubber for Hack Club!</footer>
        </div>
    `;
    scatterStars(root.querySelector<HTMLElement>('.stars')!);
    root.querySelector('#get-started')!.addEventListener('click', onStart);
}

function scatterStars(container: HTMLElement): void {
    for (let i = 0; i < 14; i++) {
        const s = document.createElement('span');
        s.className = 'star';
        s.textContent = '★';
        s.style.left = (Math.random() * 96 * 2) + '%';
        s.style.top = (Math.random() * 26).toFixed(0) + 'px';
        s.style.fontSize = (10 + Math.random() * 26).toFixed(0) + 'px';
        s.style.opacity = (0.45 + Math.random() * 0.55).toFixed(2);
        s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
        container.appendChild(s);
    }
}