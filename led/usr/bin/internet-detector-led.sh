#/bin/sh

#
# Usage: internet-detector-led.sh on|off|state|list [<LED number>|<LED sysfs-name>]
#
# Examples:
#	internet-detector-led.sh list							# list of available LEDs
#	internet-detector-led.sh on 2							# turn on LED 2
#	internet-detector-led.sh off 2							# turn off LED 2
#	internet-detector-led.sh on "nbg6817:white:internet"	# turn on LED by sysfs-name (/sys/class/leds/nbg6817:white:internet)
#	internet-detector-led.sh off "nbg6817:white:internet"	# turn off --"--
#	internet-detector-led.sh on								# same as "internet-detector-led.sh on 1" (default <LED number> is 1)
#	internet-detector-led.sh off							# turn off --"--
#	internet-detector-led.sh state 2						# current state (brightness) of LED 2
#	...
#

if [ -n $2 ]; then
	LEDN=$2
else
	LEDN=1
fi

SYSFS_LEDS="/sys/class/leds/"

LED="`ls -1 $SYSFS_LEDS | awk -v LEDN=$LEDN '{
	LEDN = (length(LEDN) == 0) ? 1 : LEDN;
	if($0 == LEDN || NR == LEDN) {
		print $0;
		exit;
	}
}'`" 2> /dev/null

LED_BR_PATH="${SYSFS_LEDS}/${LED}/brightness"

[ -w $LED_BR_PATH ] || exit 1

MAX_BRIGHTNESS=`cat ${SYSFS_LEDS}/${LED}/max_brightness` 2> /dev/null

if [ -z $MAX_BRIGHTNESS ]; then
	MAX_BRIGHTNESS=1
fi

case $1 in
on)
	printf $MAX_BRIGHTNESS > $LED_BR_PATH
;;
off)
	printf 0 > $LED_BR_PATH
;;
state)
	cat $LED_BR_PATH 2> /dev/null
;;
list)
	ls -1 $SYSFS_LEDS | awk '{print NR ": " $0}'
;;
*)
	echo "Usage: `basename $0` on|off|state|list [<LED number>|<LED sysfs-name>]" >&2
	exit 1
;;
esac

exit 0;
