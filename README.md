# Internet detector for OpenWrt.
Checking Internet availability.

OpenWrt >= 19.07.

Dependences: lua, luci-lib-nixio, libuci-lua

## Installation notes

**OpenWrt >= 21.02:**

    wget --no-check-certificate -O /tmp/internet-detector_0.3.0-2_all.ipk https://github.com/gSpotx2f/packages-openwrt/raw/master/current/internet-detector_0.3.0-2_all.ipk
    opkg install /tmp/internet-detector_0.3.0-2_all.ipk
    rm /tmp/internet-detector_0.3.0-2_all.ipk
    /etc/init.d/internet-detector start
    /etc/init.d/internet-detector enable

    wget --no-check-certificate -O /tmp/luci-app-internet-detector_0.3.0-3_all.ipk https://github.com/gSpotx2f/packages-openwrt/raw/master/current/luci-app-internet-detector_0.3.0-3_all.ipk
    opkg install /tmp/luci-app-internet-detector_0.3.0-3_all.ipk
    rm /tmp/luci-app-internet-detector_0.3.0-3_all.ipk
    /etc/init.d/rpcd restart

i18n-ru:

    wget --no-check-certificate -O /tmp/luci-i18n-internet-detector-ru_0.3.0-3_all.ipk https://github.com/gSpotx2f/packages-openwrt/raw/master/current/luci-i18n-internet-detector-ru_0.3.0-3_all.ipk
    opkg install /tmp/luci-i18n-internet-detector-ru_0.3.0-3_all.ipk
    rm /tmp/luci-i18n-internet-detector-ru_0.3.0-3_all.ipk

**OpenWrt 19.07:**

    wget --no-check-certificate -O /tmp/internet-detector_0.3.0-1_all.ipk https://github.com/gSpotx2f/packages-openwrt/raw/master/19.07/internet-detector_0.3.0-1_all.ipk
    opkg install /tmp/internet-detector_0.3.0-1_all.ipk
    rm /tmp/internet-detector_0.3.0-1_all.ipk
    /etc/init.d/internet-detector start
    /etc/init.d/internet-detector enable

    wget --no-check-certificate -O /tmp/luci-app-internet-detector_0.3.0-2_all.ipk https://github.com/gSpotx2f/packages-openwrt/raw/master/19.07/luci-app-internet-detector_0.3.0-2_all.ipk
    opkg install /tmp/luci-app-internet-detector_0.3.0-2_all.ipk
    rm /tmp/luci-app-internet-detector_0.3.0-2_all.ipk
    /etc/init.d/rpcd restart

i18n-ru:

    wget --no-check-certificate -O /tmp/luci-i18n-internet-detector-ru_0.3.0-2_all.ipk https://github.com/gSpotx2f/packages-openwrt/raw/master/19.07/luci-i18n-internet-detector-ru_0.3.0-2_all.ipk
    opkg install /tmp/luci-i18n-internet-detector-ru_0.3.0-2_all.ipk
    rm /tmp/luci-i18n-internet-detector-ru_0.3.0-2_all.ipk

## Script for LED control:

![](https://github.com/gSpotx2f/luci-app-internet-detector/blob/master/screenshots/internet-led.jpg)

LED is on when Internet is available. A specific LED can be set in `/etc/internet-detector/run-script` (`LEDN`), either by number or by name from /sys/class/leds/*****. The list of available LEDs can be obtained using the command: `/usr/bin/internet-detector-led.sh list`.

    wget --no-check-certificate -O /usr/bin/internet-detector-led.sh https://github.com/gSpotx2f/luci-app-internet-detector/raw/master/led/usr/bin/internet-detector-led.sh
    chmod +x /usr/bin/internet-detector-led.sh
    wget --no-check-certificate -O /etc/internet-detector/run-script https://github.com/gSpotx2f/luci-app-internet-detector/raw/master/led/etc/internet-detector/run-script
    chmod +x /etc/internet-detector/run-script
    uci set internet-detector.config.enable_run_script='1'
    uci commit
    /etc/init.d/internet-detector restart

## Screenshots:

![](https://github.com/gSpotx2f/luci-app-internet-detector/blob/master/screenshots/01.jpg)
![](https://github.com/gSpotx2f/luci-app-internet-detector/blob/master/screenshots/03.jpg)
![](https://github.com/gSpotx2f/luci-app-internet-detector/blob/master/screenshots/04.jpg)
