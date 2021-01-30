# luci-app-internet-detector
Internet detector for the LuCI status page (OpenWrt webUI).

OpenWrt >= 19.07.

**Installation notes:**

    wget --no-check-certificate -O /tmp/luci-app-internet-detector_0.2-1_all.ipk https://github.com/gSpotx2f/luci-app-internet-detector/raw/master/packages/19.07/luci-app-internet-detector_0.2-1_all.ipk
    opkg install /tmp/luci-app-internet-detector_0.2-1_all.ipk
    rm /tmp/luci-app-internet-detector_0.2-1_all.ipk
    /etc/init.d/rpcd restart

**i18n-ru:**

    wget --no-check-certificate -O /tmp/luci-i18n-internet-detector-ru_0.2-1_all.ipk https://github.com/gSpotx2f/luci-app-internet-detector/raw/master/packages/19.07/luci-i18n-internet-detector-ru_0.2-1_all.ipk
    opkg install /tmp/luci-i18n-internet-detector-ru_0.2-1_all.ipk
    rm /tmp/luci-i18n-internet-detector-ru_0.2-1_all.ipk

**Screenshots:**

![](https://github.com/gSpotx2f/luci-app-internet-detector/blob/master/screenshots/01.jpg)
