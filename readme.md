A express api to control ikea tradfri

## Run locally
* install dependenciesi: `npm install`
* build: `npm run build`
* start `npm run start`

## Deploy on Raspberry Pi
* clone to `home/pi`
* copy `tradfri-express.service` to `/etc/systemd/system` and enable with `systemctl enable tradfri-express.service`
* run `pi_install.sh` to transpile Typescript and restart systemd service
