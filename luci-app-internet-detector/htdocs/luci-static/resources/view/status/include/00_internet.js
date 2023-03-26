'use strict';
'require baseclass';
'require fs';
'require uci';

document.head.append(E('style', {'type': 'text/css'},
`
:root {
	--app-id-font-color: #fff;
	--app-id-connected-color: #2ea256;
	--app-id-disconnected-color: #ff4e54;
	--app-id-undefined-color: #8a8a8a;
}
:root[data-darkmode="true"] {
	--app-id-connected-color: #005F20;
	--app-id-disconnected-color: #a93734;
	--app-id-undefined-color: #4d4d4d;
}
.id-connected {
	background-color: var(--app-id-connected-color) !important;
	color: var(--app-id-font-color) !important;
}
.id-disconnected {
	background-color: var(--app-id-disconnected-color) !important;
	color: var(--app-id-font-color) !important;
}
.id-undefined {
	background-color: var(--app-id-undefined-color) !important;
	color: var(--app-id-font-color) !important;
}
`));

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
			internetStatus.className = "label id-connected";
		}
		else if(window.internetDetectorState === 1) {
			internetStatus.textContent      = _('Disconnected');
			internetStatus.className = "label id-disconnected";
		}
		else {
			internetStatus.textContent      = _('Undefined');
			internetStatus.className = "label id-undefined";
		};

		return E('div', {
			'class': 'cbi-section',
			'style': 'margin-bottom:1em',
		}, internetStatus);
	},
});
