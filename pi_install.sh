#!/bin/bash

rm -rf dist

npm install
npm run build

systemctl restart tradfri-express.service

