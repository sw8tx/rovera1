/* Rovera loader and link transition */
(function () {
  const style = document.createElement('style');
  style.textContent = `
    #rovera-loader,
    #rovera-transition {
      position: fixed;
      inset: 0;
      background: #03040f;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 28px;
    }
    #rovera-loader {
      z-index: 99999;
      transition: opacity 0.4s ease;
    }
    #rovera-loader.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    #rovera-loader img,
    #rovera-transition img {
      width: 64px;
      height: 64px;
      object-fit: contain;
      animation: roveraSpin 1.2s cubic-bezier(0.4,0,0.2,1) infinite;
    }
    #rovera-transition img {
      width: 44px;
      height: 44px;
      opacity: 0.85;
    }
    @keyframes roveraSpin {
      0% { transform: rotate(0deg) scale(1); opacity: 1; }
      50% { transform: rotate(180deg) scale(1.08); opacity: 0.75; }
      100% { transform: rotate(360deg) scale(1); opacity: 1; }
    }
    #rovera-loader-bar-wrap,
    #rovera-transition-bar-wrap {
      width: 190px;
      height: 2px;
      background: #0d0e20;
      border-radius: 2px;
      overflow: hidden;
    }
    #rovera-loader-bar,
    #rovera-transition-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #1a3a8a, #5bc4ff);
      border-radius: 2px;
      transition: width 0.12s linear;
    }
    #rovera-transition {
      z-index: 99998;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    #rovera-transition.active {
      opacity: 1;
      pointer-events: all;
    }
  `;
  document.head.appendChild(style);

  const loader = document.createElement('div');
  loader.id = 'rovera-loader';
  loader.innerHTML = `
    <img src="/logo.png" alt="Rovera">
    <div id="rovera-loader-bar-wrap">
      <div id="rovera-loader-bar"></div>
    </div>
  `;
  document.body.appendChild(loader);

  const bar = document.getElementById('rovera-loader-bar');
  const duration = 850 + Math.random() * 550;
  const start = performance.now();

  function animateBar(now) {
    const progress = Math.min(((now - start) / duration) * 100, 95);
    bar.style.width = progress + '%';
    if (progress < 95) requestAnimationFrame(animateBar);
  }

  function hideLoader() {
    bar.style.width = '100%';
    setTimeout(() => {
      loader.classList.add('fade-out');
      setTimeout(() => loader.remove(), 400);
    }, 120);
  }

  requestAnimationFrame(animateBar);
  if (document.readyState === 'complete') {
    setTimeout(hideLoader, Math.max(0, duration - (performance.now() - start)));
  } else {
    window.addEventListener('load', () => {
      setTimeout(hideLoader, Math.max(150, duration - (performance.now() - start)));
    });
  }

  const transition = document.createElement('div');
  transition.id = 'rovera-transition';
  transition.innerHTML = `
    <img src="/logo.png" alt="Rovera">
    <div id="rovera-transition-bar-wrap">
      <div id="rovera-transition-bar"></div>
    </div>
  `;
  document.body.appendChild(transition);

  function shouldSkipLink(e, a, href) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;
    if (a.hasAttribute('download')) return true;
    if (!href || href.startsWith('#')) return true;
    return /^(mailto:|tel:|javascript:)/i.test(href);
  }

  function runTransition(next) {
    const tBar = document.getElementById('rovera-transition-bar');
    transition.classList.add('active');
    tBar.style.transition = 'none';
    tBar.style.width = '0%';

    requestAnimationFrame(() => {
      tBar.style.transition = 'width 0.45s ease';
      tBar.style.width = '92%';
    });

    setTimeout(() => {
      tBar.style.transition = 'width 0.1s linear';
      tBar.style.width = '100%';
      setTimeout(next, 100);
    }, 460);
  }

  document.addEventListener('click', function (e) {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (shouldSkipLink(e, a, href)) return;

    e.preventDefault();
    runTransition(() => {
      window.location.href = a.href;
    });
  });
})();
