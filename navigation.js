(() => {
    const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    const button = document.getElementById('backToTopBtn');
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
