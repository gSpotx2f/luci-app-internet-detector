'use strict';
'require fs';

return L.Class.extend({
	title: _('Internet'),

	hosts: [
		'8.8.8.8',
		'1.1.1.1',
		'8.8.4.4',
	],

	checkInterval: 11,		// 5 x 11 = 55 sec.

	load: async function() {
		window.internetDetectorCounter = ('internetDetectorCounter' in window) ?
			++window.internetDetectorCounter : 0;
		if(!('internetDetectorState' in window)) {
			window.internetDetectorState = 1;
		};

		if(window.internetDetectorState === 0 &&
			window.internetDetectorCounter % this.checkInterval) {
			return;
		};

		for(let host of this.hosts) {
			await fs.exec('/bin/ping', [ '-c', '1', '-W', '1', host ]).then(res => {
				window.internetDetectorState = res.code;
			}).catch(e => {});

			if(window.internetDetectorState === 0) {
				break;
			};
		};
	},

	render: function() {
		let internetStatus = E('span', { 'class': 'label' });

		if(window.internetDetectorState === 0) {
			internetStatus.style.background = '#46a546';
			internetStatus.textContent = _('Internet connected');
		} else {
			internetStatus.textContent = _('Internet disconnected');
		};

		return E('div', {
			'class': 'cbi-section',
			'style': 'margin-bottom:1em',
		}, internetStatus);
	},
});
