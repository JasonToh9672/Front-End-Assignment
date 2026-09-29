(() => {
    const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    // Also support older cached pages that do not contain the button markup yet.
    const button = document.getElementById('backToTopBtn') || document.createElement('button');
    button.id = 'backToTopBtn';
    button.type = 'button';
    button.className = 'back-to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.title = 'Back to top';
    const renderArrow = () => {
        button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5M5 12l7-7 7 7" /></svg>';
    };
    renderArrow();
    if (!button.isConnected) document.body.appendChild(button);
    window.addEventListener('pageshow', renderArrow);
    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
    });

    // Wait until the page's filter handler has updated the results.
    document.addEventListener('click', event => {
        if (!event.target.closest('.filter-btn, .country-chip')) return;
        requestAnimationFrame(() => {
            const results = document.querySelector('#foodContainer, #galleryGrid');
            if (!results) return;
            const navbar = document.querySelector('.navbar.fixed-top');
            let offset = navbar ? navbar.getBoundingClientRect().height : 0;
            const filters = document.querySelector('.filter-section');
            if (filters) {
                const style = getComputedStyle(filters);
                if (style.position === 'sticky' || style.position === 'fixed') {
                    offset = Math.max(offset, (parseFloat(style.top) || 0) + filters.getBoundingClientRect().height);
                }
            }
            window.scrollTo({
                top: Math.max(0, results.getBoundingClientRect().top + window.scrollY - offset - 24),
                behavior: scrollBehavior()
            });
        });
    });
})();
