'use strict';
'require baseclass';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

const btnStyleEnabled  = 'btn cbi-button-save';
const btnStyleDisabled = 'btn cbi-button-reset';
const btnStyleApply    = 'btn cbi-button-apply';

return view.extend({
	execPath            : '/usr/bin/internet-detector',
	upScriptPath        : '/etc/internet-detector/up-script',
	downScriptPath      : '/etc/internet-detector/down-script',
	runScriptPath       : '/etc/internet-detector/run-script',
	ledsPath            : '/sys/class/leds',
	pollInterval        : L.env.pollinterval,
	appStatus           : 'stoped',
	initStatus          : null,
	inetStatus          : null,
	inetStatusLabel     : E('span', { 'class': 'label' }),
	inetStatusSpinner   : E('span', { 'class': 'spinning', 'style': 'margin-top:1em' }, ' '),
	serviceStatusLabel  : E('em'),
	serviceButton       : null,
	initButton          : null,
	uiPollCounter       : 0,
	uiPollState         : null,
	uiCheckIntervalUp   : null,
	uiCheckIntervalDown : null,
	currentAppMode      : '0',
	leds                : null,

	callInitStatus: rpc.declare({
		object: 'luci',
		method: 'getInitList',
		params: [ 'name' ],
		expect: { '': {} }
	}),

	getInitStatus: function() {
		return this.callInitStatus('internet-detector').then(res => {
			if(res) {
				return res['internet-detector'].enabled;
			} else {
				throw _('Command failed');
			}
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Failed to get %s init status: %s').format('internet-detector', e)));
		});
	},

	callInitAction: rpc.declare({
		object: 'luci',
		method: 'setInitAction',
		params: [ 'name', 'action' ],
		expect: { result: false }
	}),

	handleServiceAction: function(action) {
		return this.callInitAction('internet-detector', action).then(success => {
			if(!success) {
				throw _('Command failed');
			};
			return true;
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Service action failed "%s %s": %s').format('internet-detector', action, e)));
		});
	},

	serviceRestart: function(ev) {
		poll.stop();
		return this.handleServiceAction('restart').then(() => {
			this.servicePoll();
			poll.start();
		});
	},

	fileEditDialog: baseclass.extend({
		__init__: function(file, title, description, callback, fileExists=false) {
			this.file        = file;
			this.title       = title;
			this.description = description;
			this.callback    = callback;
			this.fileExists  = fileExists;
		},

		load: function() {
			return fs.read(this.file);
		},

		render: function(content) {
			ui.showModal(this.title, [
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'class': 'cbi-section-descr' }, this.description),
					E('div', { 'class': 'cbi-section' },
						E('p', {},
							E('textarea', {
								'id': 'widget.modal_content',
								'class': 'cbi-input-textarea',
								'style': 'width:100% !important',
								'rows': 10,
								'wrap': 'off',
								'spellcheck': 'false',
							},
							content || '')
						)
					),
				]),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal,
					}, _('Dismiss')),
					' ',
					E('button', {
						'id': 'btn_save',
						'class': 'btn cbi-button-positive important',
						'click': ui.createHandlerFn(this, this.handleSave),
					}, _('Save')),
				]),
			]);
		},

		handleSave: function(ev) {
			let textarea = document.getElementById('widget.modal_content');
			let value = textarea.value.trim().replace(/\r\n/g, '\n') + '\n';

			return fs.write(this.file, value).then(rc => {
				textarea.value = value;
				ui.addNotification(null, E('p', _('Contents have been saved.')),
					'info');
				if(this.callback) {
					return this.callback(rc);
				};
			}).catch(e => {
				ui.addNotification(null, E('p', _('Unable to save the contents')
					+ ': %s'.format(e.message)));
			}).finally(() => {
				ui.hideModal();
			});
		},

		error: function(e) {
			if(!this.fileExists && e instanceof Error && e.name === 'NotFoundError') {
				return this.render();
			} else {
				ui.showModal(this.title, [
					E('div', { 'class': 'cbi-section' },
						E('p', {}, _('Unable to read the contents')
							+ ': %s'.format(e.message))
					),
					E('div', { 'class': 'right' },
						E('button', {
							'class': 'btn',
							'click': ui.hideModal,
						}, _('Dismiss'))
					),
				]);
			};
		},

		show: function() {
			ui.showModal(null,
				E('p', { 'class': 'spinning' }, _('Loading'))
			);
			this.load().then(content => {
				ui.hideModal();
				return this.render(content);
			}).catch(e => {
				ui.hideModal();
				return this.error(e);
			})
		},
	}),

	setInternetStatus: function(initial=false) {
		if(this.inetStatus === 'up') {
			this.inetStatusLabel.style.background = '#46a546';
			this.inetStatusLabel.textContent = _('Connected');
		}
		else if(this.inetStatus === 'down') {
			this.inetStatusLabel.textContent = _('Disconnected');
			this.inetStatusLabel.style.background = '#ff6c74';
		}
		else {
			this.inetStatusLabel.textContent = _('Undefined');
			this.inetStatusLabel.style.background = '#cccccc';
		};

		if(!initial && this.inetStatusSpinner) {
			this.inetStatusSpinner.remove();
		};

		if(this.appStatus === 'running') {
			this.serviceStatusLabel.textContent = _('Running');
		} else {
			this.serviceStatusLabel.textContent = _('Stopped');
		};
	},

	CBIBlockTitle: form.DummyValue.extend({
		string: null,

		renderWidget: function(section_id, option_index, cfgvalue) {
			this.title = this.description = null;
			return E([
				E('label', { 'class': 'cbi-value-title' }),
				E('div', { 'class': 'cbi-value-field' },
					E('b', {}, this.string)
				),
			]);
		},
	}),

	CBIBlockService: form.DummyValue.extend({
		ctx: null,

		renderWidget: function(section_id, option_index, cfgvalue) {
			this.title = this.description = null;

			this.ctx.serviceButton = E('button', {
				'class': btnStyleApply,
				'click': ui.createHandlerFn(this.ctx, this.ctx.serviceRestart),
			}, _('Restart'));
			this.ctx.initButton = E('button', {
				'class': (!this.ctx.initStatus) ? btnStyleDisabled : btnStyleEnabled,
				'click': ui.createHandlerFn(this, () => {
					return this.ctx.handleServiceAction(
						(!this.ctx.initStatus) ? 'enable' : 'disable'
					).then(success => {
						if(!success) {
							return;
						};
						if(!this.ctx.initStatus) {
							this.ctx.initButton.textContent = _('Enabled');
							this.ctx.initButton.className = btnStyleEnabled;
							this.ctx.initStatus = true;
						}
						else {
							this.ctx.initButton.textContent = _('Disabled');
							this.ctx.initButton.className = btnStyleDisabled;
							this.ctx.initStatus = false;
						};
					});
				}),
			}, (!this.ctx.initStatus) ? _('Disabled') : _('Enabled'));

			this.ctx.setInternetStatus(true);

			let serviceItems = '';
			if(this.ctx.currentAppMode === '2') {
				serviceItems = E([
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' },
							_('Service')
						),
						E('div', { 'class': 'cbi-value-field' },
							this.ctx.serviceStatusLabel
						),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' },
							_('Restart service')
						),
						E('div', { 'class': 'cbi-value-field' },
							this.ctx.serviceButton
						),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' },
							_('Run service at startup')
						),
						E('div', { 'class': 'cbi-value-field' },
							this.ctx.initButton
						),
					]),
				]);
			};

			let internetStatus = (this.ctx.currentAppMode !== '0') ?
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' },
						_('Internet status')
					),
					E('div', { 'class': 'cbi-value-field' }, [
						this.ctx.inetStatusLabel,
						(!this.ctx.inetStatus) ? this.ctx.inetStatusSpinner : '',
					]),
				])
			: '';

			return E('div', { 'class': 'cbi-section fade-in' },
				E('div', { 'class': 'cbi-section-node' }, [
					internetStatus,
					serviceItems,
				])
			);
		},
	}),

	servicePoll: function() {
		return Promise.all([
			fs.exec(this.execPath, [ 'status' ]),
			fs.exec(this.execPath, [ 'inet-status' ]),
		]).then(stat => {
			let curAppStatus  = (stat[0].code === 0) ? stat[0].stdout.trim() : null;
			let curInetStatus = (stat[1].code === 0) ? stat[1].stdout.trim() : null;

			if(this.inetStatus === curInetStatus && this.appStatus === curAppStatus) {
				return;
			};
			this.appStatus  = curAppStatus;
			this.inetStatus = curInetStatus;
			this.setInternetStatus();
		}).catch(e => {
			this.appStatus  = 'stoped';
			this.inetStatus = null;
		});
	},

	uiPoll: function() {
		let curInetStatus = null;
		this.uiPollCounter = ++this.uiPollCounter;

		if((this.uiPollState === 0 && this.uiPollCounter % this.uiCheckIntervalUp) ||
			(this.uiPollState === 1 && this.uiPollCounter % this.uiCheckIntervalDown)) {
			return;
		};

		this.uiPollCounter = 0;

		return fs.exec(this.execPath, [ 'inet-status' ]).then(res => {
			this.uiPollState = (res.code === 0 && res.stdout.trim() === 'up') ? 0 : 1;

			if(this.uiPollState === 0) {
				curInetStatus = 'up';
			} else {
				curInetStatus = 'down';
			};

			if(this.inetStatus !== curInetStatus) {
				this.inetStatus = (this.currentAppMode === '0') ? null : curInetStatus;
				this.setInternetStatus();
			};
		});
	},

	load: function() {
		return Promise.all([
			fs.exec(this.execPath, [ 'status' ]),
			this.getInitStatus(),
			fs.list(this.ledsPath),
			uci.load('internet-detector'),
		]).catch(e => {
			ui.addNotification(null, E('p', _('An error has occurred') + ': %s'.format(e.message)));
		});
	},

	render: function(data) {
		if(!data) {
			return;
		};
		this.appStatus           = (data[0].code === 0) ? data[0].stdout.trim() : null;
		this.initStatus          = data[1];
		this.leds                = data[2];
		this.currentAppMode      = uci.get('internet-detector', 'config', 'mode');
		this.uiCheckIntervalUp   = Number(uci.get('internet-detector', 'ui_config', 'interval_up'));
		this.uiCheckIntervalDown = Number(uci.get('internet-detector', 'ui_config', 'interval_down'));

		let upScriptEditDialog = new this.fileEditDialog(
			this.upScriptPath,
			_('up-script'),
			_('Shell commands that run when connected to the Internet'),
		);
		let downScriptEditDialog = new this.fileEditDialog(
			this.downScriptPath,
			_('down-script'),
			_('Shell commands to run when disconnected from the Internet'),
		);
		let runScriptEditDialog = new this.fileEditDialog(
			this.runScriptPath,
			_('run-script'),
			_("Shell commands that are executed every time the Internet is checked for availability"),
		);


		/* UCI sections	*/

		let s, o;

		//// Main configuration

		let mMain = new form.Map('internet-detector');
		s         = mMain.section(form.NamedSection, 'config');

		// service widget
		o     = s.option(this.CBIBlockService, '_dummy_service');
		o.ctx = this;

		// mode
		o = s.option(form.ListValue,
			'mode', _('Internet detector mode'));
		o.value('0', _('Disabled'));
		o.value('1', _('Web UI only'));
		o.value('2', _('Service'));
		o.description = '%s;<br />%s;<br />%s;'.format(
			_('Disabled: detector is completely off'),
			_('Web UI only: detector works only when the Web UI is open (UI detector)'),
			_('Service: detector always runs as a system service')
		);

		// hosts
		o = s.option(form.DynamicList,
			'hosts', _('Hosts'));
		o.description = _('Hosts to check Internet availability. Hosts are polled (in list order) until at least one of them responds');
		o.datatype    = 'or(host,hostport)';

		// check_type
		o = s.option(form.ListValue,
			'check_type', _('Check type'));
		o.description = _('Host availability check type');
		o.value(0, _('TCP port connection'));
		o.value(1, _('Ping host'));

		// tcp_port
		o = s.option(form.Value,
			'tcp_port', _('TCP port'));
		o.description = _('Default port value for TCP connections');
		o.rmempty     = false;
		o.datatype    = "port";


		//// UI detector configuration

		let mUi = new form.Map('internet-detector');
		s       = mUi.section(form.NamedSection, 'ui_config');

		let makeUIIntervalOptions = L.bind(function(list) {
			list.value(1, '%d %s'.format(this.pollInterval, _('sec')));
			list.value(2, '%d %s'.format(this.pollInterval * 2, _('sec')));
			list.value(3, '%d %s'.format(this.pollInterval * 3, _('sec')));
			list.value(4, '%d %s'.format(this.pollInterval * 4, _('sec')));
			list.value(5, '%d %s'.format(this.pollInterval * 5, _('sec')));
			list.value(6, '%d %s'.format(this.pollInterval * 6, _('sec')));
		}, this);

		// interval_up
		o = s.option(form.ListValue,
			'interval_up', _('Alive interval'));
		o.description = _('Hosts polling interval when the Internet is up');
		makeUIIntervalOptions(o);

		// interval_down
		o = s.option(form.ListValue,
			'interval_down', _('Dead interval'));
		o.description = _('Hosts polling interval when the Internet is down');
		makeUIIntervalOptions(o);

		// connection_attempts
		o = s.option(form.ListValue,
			'connection_attempts', _('Connection attempts'));
		o.description = _('Maximum number of attempts to connect to each host');
		o.value(1);
		o.value(2);
		o.value(3);

		// connection_timeout
		o = s.option(form.ListValue,
			'connection_timeout', _('Connection timeout'));
		o.description = _('Maximum timeout for waiting for a response from the host');
		o.value(1, "1 " + _('sec'));
		o.value(2, "2 " + _('sec'));
		o.value(3, "3 " + _('sec'));


		//// Service configuration

		let mService = new form.Map('internet-detector');
		s            = mService.section(form.NamedSection, 'service_config');

		function makeIntervalOptions(list) {
			list.value(2,   '2 '  + _('sec'));
			list.value(5,   '5 '  + _('sec'));
			list.value(10,  '10 ' + _('sec'));
			list.value(15,  '15 ' + _('sec'));
			list.value(20,  '20 ' + _('sec'));
			list.value(25,  '25 ' + _('sec'));
			list.value(30,  '30 ' + _('sec'));
			list.value(60,  '1 '  + _('min'));
			list.value(120, '2 '  + _('min'));
			list.value(300, '5 '  + _('min'));
			list.value(600, '10 ' + _('min'));
		}

		// interval_up
		o = s.option(form.ListValue,
			'interval_up', _('Alive interval'));
		o.description = _('Hosts polling interval when the Internet is up');
		makeIntervalOptions(o);

		// interval_down
		o = s.option(form.ListValue,
			'interval_down', _('Dead interval'));
		o.description = _('Hosts polling interval when the Internet is down');
		makeIntervalOptions(o);

		// connection_attempts
		o = s.option(form.ListValue,
			'connection_attempts', _('Connection attempts'));
		o.description = _('Maximum number of attempts to connect to each host');
		o.value(1);
		o.value(2);
		o.value(3);
		o.value(4);
		o.value(5);

		// connection_timeout
		o = s.option( form.ListValue,
			'connection_timeout', _('Connection timeout'));
		o.description = _('Maximum timeout for waiting for a response from the host');
		o.value(1, "1 " + _('sec'));
		o.value(2, "2 " + _('sec'));
		o.value(3, "3 " + _('sec'));
		o.value(4, "4 " + _('sec'));
		o.value(5, "5 " + _('sec'));
		o.value(6, "6 " + _('sec'));
		o.value(7, "7 " + _('sec'));
		o.value(8, "8 " + _('sec'));
		o.value(9, "9 " + _('sec'));
		o.value(10, "10 " + _('sec'));

		// enable_logger
		o = s.option(form.Flag,
			'enable_logger', _('Enable logging'));
		o.description = _('Write messages to the system log');
		o.rmempty     = false;

		// enable_up_script
		o = s.option(form.Flag,
			'enable_up_script', _('Enable up-script'));
		o.description = _('Execute commands when the Internet is connected');
		o.rmempty     = false;

		// up_script edit dialog
		o = s.option(form.Button,
			'_up_script_btn', _('Edit up-script'));
		o.onclick    = () => upScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

		// enable_down_script
		o = s.option(form.Flag,
			'enable_down_script', _('Enable down-script'));
		o.description = _('Execute commands when the Internet is disconnected');
		o.rmempty     = false;

		// down_script edit dialog
		o = s.option(form.Button,
			'_down_script_btn', _('Edit down-script'));
		o.onclick    = () => downScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

		// enable_run_script
		o = s.option(form.Flag,
			'enable_run_script', _('Enable run-script'));
		o.description = _('Execute commands every time the Internet is checked for availability');
		o.rmempty     = false;

		// run_script edit dialog
		o = s.option(form.Button,
			'_run_script_btn', _('Edit run-script'));
		o.onclick    = () => runScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';


		/* Modules */

		//// LED control

		let mLed = new form.Map('internet-detector');
		s        = mLed.section(form.NamedSection, 'mod_led_control');

		o        = s.option(this.CBIBlockTitle, '_dummy');
		o.string = _('<abbr title="Light Emitting Diode">LED</abbr> control') + ':';

		if(this.leds && this.leds.length > 0) {

			// enabled
			o = s.option(form.Flag, 'enabled',
				_('Enable <abbr title="Light Emitting Diode">LED</abbr> control'));
			o.rmempty     = false;
			o.description = _('<abbr title="Light Emitting Diode">LED</abbr> is on when Internet is available.');

			// led_name
			o = s.option(form.ListValue, 'led_name',
				_('<abbr title="Light Emitting Diode">LED</abbr> Name'));
			o.depends('enabled', '1');
			this.leds.sort((a, b) => a.name > b.name);
			this.leds.forEach(e => o.value(e.name));
		} else {
			o         = s.option(form.DummyValue, '_dummy');
			o.rawhtml = true;
			o.default = '<label class="cbi-value-title"></label><div class="cbi-value-field"><em>' +
				_('No <abbr title="Light Emitting Diode">LED</abbr>s available...') +
				'</em></div>';
		};


		/* Rendering */

		let settingsNode = E('div', { 'class': 'cbi-section fade-in' },
			E('div', { 'class': 'cbi-section-node' },
				E('div', { 'class': 'cbi-value' },
					E('em', { 'class': 'spinning' }, _('Collecting data...'))
				)
			)
		);

		Promise.all([
			mMain.render(),
			mUi.render(),
			mService.render(),
			mLed.render(),
		]).then(maps => {
			let settingsTabs  = E('div', { 'class': 'cbi-section fade-in' });
			let tabsContainer = E('div', { 'class': 'cbi-section-node cbi-section-node-tabbed' });
			settingsTabs.append(tabsContainer);

			// Main settings tab
			let mainTab  = E('div', {
				'data-tab'      : 0,
				'data-tab-title': _('Main settings'),
			}, maps[0]);
			tabsContainer.append(mainTab);

			// UI detector configuration tab
			let uiTab = E('div', {
				'data-tab'      : 1,
				'data-tab-title': _('UI detector configuration'),
			}, maps[1]);
			tabsContainer.append(uiTab);

			// Service configuration tab
			let serviceTab = E('div', {
				'data-tab'      : 2,
				'data-tab-title': _('Service configuration'),
			}, maps[2]);

			// LED control
			serviceTab.append(maps[3]);

			tabsContainer.append(serviceTab);

			ui.tabs.initTabGroup(tabsContainer.children);
			settingsNode.replaceWith(settingsTabs);

			if(this.currentAppMode !== '0') {
				poll.add(
					L.bind((this.currentAppMode === '2') ? this.servicePoll : this.uiPoll, this),
					this.pollInterval
				);
			};
		}).catch(e => ui.addNotification(null, E('p', {}, e.message)));

		return E([
			E('h2', { 'class': 'fade-in' }, _('Internet detector')),
			E('div', { 'class': 'cbi-section-descr fade-in' },
				_('Checking Internet availability.')),
			settingsNode,
		]);
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(() => {
			ui.changes.apply(mode == '0');
			window.setTimeout(() => this.serviceRestart(), 3000);
		});
	},
});
