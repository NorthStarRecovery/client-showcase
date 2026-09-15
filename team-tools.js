/* Approved campaign links and an explicit, browser-only staff label. */
(() => {
  'use strict';
  const config = window.NORTHSTAR_ANALYTICS_CONFIG || {};
  const publicOrigin = 'https://northstarrecovery.github.io';
  const base = config.publicBasePath;
  const byId = id => document.getElementById(id);
  const destinationSelect = byId('tt-destination');
  const channelSelect = byId('tt-channel');
  const campaignSelect = byId('tt-campaign');
  const output = byId('tt-link');
  const copyButton = byId('tt-copy');
  const preview = byId('tt-preview');
  const staffButton = byId('tt-mark-staff');
  const unmarkButton = byId('tt-unmark-staff');
  const industries = [
    ['manufacturing', 'Manufacturing'], ['industrial', 'Industrial'],
    ['commercial-real-estate', 'Commercial real estate'], ['medical', 'Medical'],
    ['education', 'Education'], ['technology', 'Technology']
  ];
  const materials = [
    ['hospitality-readiness', 'Hospitality readiness'],
    ['hospitality-recovery', 'Hospitality recovery'],
    ['hospitality-capital-renewal', 'Hospitality capital renewal'],
    ['national-recovery-capabilities', 'National recovery capabilities'],
    ['emergency-activation-guide', 'Emergency activation guide'],
    ['emergency-response-request', 'Emergency response request'],
    ['premier-response-program', 'Premier Response program'],
    ['premier-response-journey', 'Premier Response journey'],
    ...industries.flatMap(([id, title]) => ['overview', 'brief'].map(edition =>
      [`${id}-${edition}`, `${title} recovery ${edition}`]))
  ];
  const presets = [
    { id: 'email', title: 'Email outreach', source: 'email', medium: 'email' },
    { id: 'linkedin', title: 'LinkedIn post', source: 'linkedin', medium: 'social' },
    { id: 'newsletter', title: 'Newsletter', source: 'newsletter', medium: 'email' },
    { id: 'qr', title: 'QR code', source: 'qr', medium: 'qr' },
    { id: 'print', title: 'Printed material', source: 'northstar', medium: 'print' },
    { id: 'website', title: 'Website referral', source: 'website', medium: 'referral' },
    { id: 'event', title: 'Event', source: 'event', medium: 'event' }
  ];
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const allowed = key => new Set(Array.isArray(config[key]) ? config[key].filter(value =>
    typeof value === 'string' && value.length <= 80 && slug.test(value)) : []);
  const sources = allowed('campaignSources');
  const mediums = allowed('campaignMediums');
  const campaigns = allowed('campaignNames');
  const channels = presets.filter(preset => sources.has(preset.source) && mediums.has(preset.medium));
  const destinations = [
    { id: 'home', title: 'Client Showcase home', path: '', campaign: 'client-showcase', group: 'Showcase' },
    { id: 'marketing', title: 'All marketing materials', path: 'marketing/', campaign: 'marketing-collection', group: 'Showcase' },
    ...industries.map(([id, title]) => ({ id, title: `${title} industry focus`,
      path: `marketing/?category=${encodeURIComponent(title)}#industry-focus`, campaign: id, group: 'Industry focus' })),
    ...materials.map(([id, title]) => ({ id, title, path: `marketing/${id}.html`,
      campaign: campaigns.has(id) ? id : id.startsWith('premier-response-') ? 'premier-response' : 'marketing-collection', group: 'Marketing materials' }))
  ];
  function status(id, message, error = false) {
    const element = byId(id);
    element.textContent = message;
    element.dataset.state = error ? 'error' : 'ready';
  }
  function option(parent, value, label) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    parent.appendChild(element);
  }
  function title(value) {
    if (value === 'client-showcase') return 'Client Showcase';
    if (value === 'premier-response') return 'Premier Response';
    const label = value.replaceAll('-', ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  function clearLink(message) {
    output.value = '';
    copyButton.disabled = true;
    preview.removeAttribute('href');
    preview.setAttribute('aria-disabled', 'true');
    preview.tabIndex = -1;
    status('tt-link-status', message, true);
  }
  function updateLink() {
    const destination = destinations.find(item => item.id === destinationSelect.value);
    const channel = channels.find(item => item.id === channelSelect.value);
    if (!destination || !channel || !campaigns.has(campaignSelect.value)) {
      clearLink('Choose an approved destination, channel and campaign to create a link.');
      return;
    }
    const url = new URL(destination.path, publicOrigin + base);
    url.searchParams.set('utm_source', channel.source);
    url.searchParams.set('utm_medium', channel.medium);
    url.searchParams.set('utm_campaign', campaignSelect.value);
    output.value = url.href;
    preview.href = url.href;
    preview.removeAttribute('aria-disabled');
    preview.removeAttribute('tabindex');
    copyButton.disabled = false;
    status('tt-link-status', `${destination.title} · ${channel.title}. Ready to copy.`);
  }
  byId('tt-form').addEventListener('submit', event => event.preventDefault());
  const validConfig = typeof base === 'string' && /^\/[a-z0-9-]+\/$/.test(base)
    && config.allowedHosts?.includes('northstarrecovery.github.io') && channels.length && campaigns.size;
  if (validConfig) {
    destinationSelect.replaceChildren();
    for (const groupName of ['Showcase', 'Industry focus', 'Marketing materials']) {
      const group = document.createElement('optgroup');
      group.label = groupName;
      destinations.filter(item => item.group === groupName).forEach(item => option(group, item.id, item.title));
      destinationSelect.appendChild(group);
    }
    channels.forEach(item => option(channelSelect, item.id, item.title));
    campaigns.forEach(value => option(campaignSelect, value, title(value)));
    destinationSelect.value = 'home';
    channelSelect.value = channels.some(item => item.id === 'email') ? 'email' : channels[0].id;
    campaignSelect.value = campaigns.has('client-showcase') ? 'client-showcase' : [...campaigns][0];
    byId('tt-link-fields').disabled = false;
    updateLink();
  } else {
    clearLink('Campaign settings are unavailable. Reload the published team tools page to try again.');
  }
  destinationSelect.addEventListener('change', () => {
    const suggestion = destinations.find(item => item.id === destinationSelect.value)?.campaign;
    if (campaigns.has(suggestion)) campaignSelect.value = suggestion;
    updateLink();
  });
  channelSelect.addEventListener('change', updateLink);
  campaignSelect.addEventListener('change', updateLink);
  copyButton.addEventListener('click', async () => {
    if (copyButton.disabled || !output.value) return;
    const copied = output.value;
    try {
      await navigator.clipboard.writeText(copied);
      status('tt-link-status', copied === output.value ? 'Campaign link copied. Paste it into your outreach.'
        : 'The previous link was copied. Copy again to use your updated selection.');
    } catch {
      output.focus();
      output.select();
      status('tt-link-status', 'Automatic copying is unavailable. The link is selected; copy it with your keyboard or browser menu.', true);
    }
  });
  const published = validConfig && location.origin === publicOrigin && !location.port
    && location.pathname === base + 'team-tools.html' && window.NORTHSTAR_MODE !== 'internal'
    && !document.documentElement.hasAttribute('data-offline-portfolio');
  function showAudience() {
    const audience = window.NorthStarAnalytics?.getAudience?.();
    if (!['staff', 'unclassified'].includes(audience)) throw new Error('Audience unavailable');
    byId('tt-audience-state').textContent = audience === 'staff' ? 'Staff' : 'Unclassified';
    staffButton.disabled = audience === 'staff';
    unmarkButton.disabled = audience !== 'staff';
    return audience;
  }
  function saveAudience(audience) {
    if (!published) return;
    try {
      if (window.NorthStarAnalytics?.setAudience?.(audience) !== true) throw new Error('Audience not saved');
      if (showAudience() !== audience) throw new Error('Audience not confirmed');
      status('tt-audience-status', audience === 'staff'
        ? 'Saved. Future activity in this browser will be labeled as staff.'
        : 'Saved. Future activity in this browser will be unclassified.');
    } catch {
      status('tt-audience-status', 'The browser label could not be saved. Check that this site can store browser data, then try again.', true);
    }
  }
  if (published) {
    try {
      showAudience();
      status('tt-audience-status', 'Choose a browser label for future visits and actions.');
    } catch {
      byId('tt-audience-state').textContent = 'Unavailable';
      status('tt-audience-status', 'Browser classification is unavailable. Reload this page to try again.', true);
    }
    window.addEventListener('storage', event => {
      if (event.key !== 'northstar.analytics.audience.v1' && event.key !== null) return;
      try {
        showAudience();
        status('tt-audience-status', 'Browser label refreshed after a change in another tab.');
      } catch {
        byId('tt-audience-state').textContent = 'Unavailable';
        staffButton.disabled = true;
        unmarkButton.disabled = true;
        status('tt-audience-status', 'Browser classification could not be refreshed. Reload this page to try again.', true);
      }
    });
  } else {
    byId('tt-audience-state').textContent = 'Preview only';
    status('tt-audience-status', 'Open the published team tools page to label this browser. Local and offline previews are not measured.');
  }
  staffButton.addEventListener('click', () => saveAudience('staff'));
  unmarkButton.addEventListener('click', () => saveAudience('unclassified'));
})();
