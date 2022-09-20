'use strict';
'require baseclass';
'require fs';
'require uci';

return baseclass.extend({
	title      : _('Internet'),
	appName    : 'internet-detector',
	execPath   : '/usr/bin/internet-detector',
	inetStatus : null,
	publicIp   : null,

	inetStatusFromJson: function(res) {
		let curInetStatus = null;
		let curPubIp      = null;
		if(res.code === 0) {
			try {
				let json          = JSON.parse(res.stdout.trim());
				curInetStatus = json.inet;
				curPubIp      = json.mod_public_ip;
			} catch(e) {};
		};
		return [ curInetStatus, curPubIp ];
	},

	load: async function() {
		if(!(
			'uiCheckIntervalUp' in window &&
			'uiCheckIntervalDown' in window &&
			'currentAppMode' in window
		)) {
			await uci.load(this.appName).then(data => {
				window.uiCheckIntervalUp   = Number(uci.get(this.appName, 'config', 'ui_interval_up'));
				window.uiCheckIntervalDown = Number(uci.get(this.appName, 'config', 'ui_interval_down'));
				window.currentAppMode      = uci.get(this.appName, 'config', 'mode');
			}).catch(e => {});
		};

		if(window.currentAppMode === '1' || window.currentAppMode === '2') {
			window.internetDetectorCounter = ('internetDetectorCounter' in window) ?
				++window.internetDetectorCounter : 0;

			if(!('internetDetectorState' in window)) {
				window.internetDetectorState = 2;
			};
			if(window.currentAppMode === '1' && (
				(window.internetDetectorState === 0 && window.internetDetectorCounter % window.uiCheckIntervalUp) ||
				(window.internetDetectorState === 1 && window.internetDetectorCounter % window.uiCheckIntervalDown)
			)) {
				return;
			};

			window.internetDetectorCounter = 0;
			return L.resolveDefault(fs.exec(this.execPath, [ 'inet-status-json' ]), null);
		}
		else {
			window.internetDetectorState = 2;
		};
	},

	render: function(data) {
		if(window.currentAppMode === '0') {
			return
		};

		if(data) {
			[ window.internetDetectorState, this.publicIp ] = this.inetStatusFromJson(data);
		};

		let internetStatus = E('span', { 'class': 'label' });

		if(window.internetDetectorState === 0) {
			internetStatus.textContent      = _('Connected') + (this.publicIp ? ' | %s: %s'.format(_('Public IP'), _(this.publicIp)) : '');
			internetStatus.style.background = '#2ea256';
			internetStatus.style.color      = '#fff';
		}
		else if(window.internetDetectorState === 1) {
			internetStatus.textContent      = _('Disconnected');
			internetStatus.style.background = '#ff4e54';
			internetStatus.style.color      = '#fff';
		}
		else {
			internetStatus.textContent      = _('Undefined');
			internetStatus.style.background = '#8a8a8a';
			internetStatus.style.color      = '#fff';
		};

		return E('div', {
			'class': 'cbi-section',
			'style': 'margin-bottom:1em',
		}, internetStatus);
	},
});
