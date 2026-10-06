/* UI: the optional "Buy me a coffee" link. A plain link (no third-party script, no tracking), shown only in calm places:
   start page footer, results page, Options → About and the command palette. Never during a session or in print.
   The address is App.config.supportUrl (src/js/00-core.js); an empty value hides it everywhere. */
(function () {
    const { el, icon } = App.util;
    const url = () => (App.config && App.config.supportUrl) || '';

    App.ui.supportLink = function () {
        if (!url()) return null;
        return el('a', { class: 'support-link', href: url(), target: '_blank', rel: 'noopener noreferrer' }, icon('coffee', 16), el('span', { text: App.t('supportBtn') }));
    };
    App.ui.supportBlock = function () {
        if (!url()) return null;
        return el('div', { class: 'support' }, el('span', { class: 'support-text', text: App.t('supportText') }), App.ui.supportLink());
    };
})();
