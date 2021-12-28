import * as fs from 'fs'
import config from './Config.js'
import {Accessory, AccessoryTypes, discoverGateway, Group, Scene, Spectrum, TradfriClient} from 'node-tradfri-client'
import Logger from './util/Logger.js'
import IPSODeviceUsageSorter from './util/IPSODeviceUsageSorter.js';
import {Service} from './Service'
import {Application, Request, Response} from 'express'

export type LightResponse = {
    name: string
    id: number
    spectrum?: Spectrum
    color?: string
    brightness?: number
}

export type GroupResponse = {
    name: string,
    lights: Array<LightResponse>
}

export type SceneResponse = {
    name: string,
    id: number
}

export default class LightsService implements Service {
    private connection?: TradfriClient
    private scenes: Array<Scene> = []
    private lights: Array<Accessory> = []
    private groupLightsMap = new Map<string, Array<number>>();
    private superGroup?: Group
    private logger = new Logger('lights')
    private scenesUsageSorter = new IPSODeviceUsageSorter<Scene>();

    constructor() {
        this.initConnection().then(() => this.initDataAndListeners()).catch()
    }

    async initConnection(): Promise<void> {
        this.logger.log('discovering tradfri gateway')
        let gateway
        try {
            gateway = await discoverGateway()
        } catch (e) {
            this.logger.alert('Cannot discover gateway')
            console.log(e)
        }
        if (!gateway) {
            return
        }

        this.logger.log('got gateway ' + gateway.name)
        this.connection = new TradfriClient(gateway.name)

        let identity: string
        let psk: string

        try {
            this.logger.log('reading credentials from file')
            let credsFile = JSON.parse(fs.readFileSync(config.tradfri.credentialsFileLocation, 'utf-8'))
            identity = credsFile.identity
            psk = credsFile.psk
        } catch (e) {
            this.logger.alert('failed to read credentials from file, will reauthenticate')
            const response = await this.connection.authenticate(config.tradfri.securityId)
            identity = response.identity
            psk = response.psk
            fs.writeFile(
                config.tradfri.credentialsFileLocation,
                JSON.stringify({identity, psk}),
                () => this.logger.log(`wrote new credentials to ${config.tradfri.credentialsFileLocation}`)
            )
        }
        await this.connection.connect(identity, psk)
    }

    async initDataAndListeners(): Promise<void> {
        if (!this.connection) {
            return
        }

        const deleteScene = (id: number) => {
            this.scenes = this.scenes.filter(s => s.instanceId !== id)
        }

        const addOrUpdateScene = (scene: Scene) => {
            this.logger.log(`retrieved information for scene ${scene.name}`)
            deleteScene(scene.instanceId)
            this.scenes.push(scene)
        }

        const deleteLight = (id: number) => {
            this.lights = this.lights.filter(b => b.instanceId !== id)
        }

        const addOrUpdateLight = (device: Accessory) => {
            deleteLight(device.instanceId)
            if (device.type === AccessoryTypes.lightbulb) {
                this.logger.log(`retrieved information for lightbulb ${device.name}`)
                this.lights.push(device)
            }
        }

        this.connection
            .on('scene updated', (_group: number, scene: Scene) => addOrUpdateScene(scene))
            .on('scene removed', (_group: number, instanceId: number) => deleteScene(instanceId))
            .on('group updated', (group: Group) => {
                    if (group.name === 'SuperGroup') {
                        this.superGroup = group
                    } else {
                        this.groupLightsMap.set(group.name, group.deviceIDs)
                    }
                }
            )
            .observeGroupsAndScenes()
            .catch()

        this.connection
            .on('device updated', (device: Accessory) => addOrUpdateLight(device))
            .on('device removed', (instanceId: number) => deleteLight(instanceId))
            .observeDevices()
            .catch()
    }

    registerEndpoints(app: Application): void {
        app.get('/groups', async (_req: Request, res: Response) => {
            res.send(this.getGroups())
        })

        app.post('/lights/:id/brightness', async (req: Request, res: Response) => {
            try {
                const {id} = req.params;
                const instanceId = Number.parseInt(id as string, 10)
                await this.setLightBrightness(instanceId, Number.parseFloat(req.body))
                res.sendStatus(200)
            } catch (e) {
                res.sendStatus(500)
            }
        })

        app.post('/lights/:id/temperature', async (req: Request, res: Response) => {
            try {
                const {id} = req.params;
                const instanceId = Number.parseInt(id as string, 10)
                await this.setLightTemperature(instanceId, Number.parseFloat(req.body))
                res.sendStatus(200)
            } catch (e) {
                res.sendStatus(500)
            }
        })

        app.post('/lights/:id/color', async (req: Request, res: Response) => {
            try {
                const {id} = req.params;
                const instanceId = Number.parseInt(id as string, 10)
                await this.setLightColor(instanceId, req.body)
                res.sendStatus(200)
            } catch (e) {
                res.sendStatus(500)
            }
        })


        app.get('/scenes', async (_req: Request, res: Response) => {
            res.send(this.getScenes())
        })

        app.post('/scenes', async (req: Request, res: Response) => {
            try {
                const instanceId = Number.parseInt(req.body, 10)
                await this.setScene(instanceId)
                this.scenesUsageSorter.registerUsage(instanceId);
                res.sendStatus(200)
            } catch (e) {
                res.sendStatus(500)
            }
        })
    }

    getGroups(): Array<GroupResponse> {
        return Array.from(this.groupLightsMap.keys())
            .map((name: string) => {
                return {
                    name,
                    // @ts-ignore
                    lights: this.groupLightsMap.get(name).filter(id => this.lights.some(light => light.instanceId === id)).map(id => this.lights.filter(light => light.instanceId === id)[0]).map((light: Accessory) => ({
                        name: light.name,
                        id: light.instanceId,
                        spectrum: light.lightList[0]?.spectrum,
                        color: '#' + light.lightList[0]?.color,
                        brightness: light.lightList[0]?.onOff ? (light.lightList[0]?.dimmer / 100) : 0
                    }))
                }
            })
    }

    async setLightBrightness(lightId: number, brightness: number): Promise<void> {
        const light = this.lights.filter(light => light.instanceId === lightId)[0]
        if (!light) {
            this.logger.alert('cannot set brightness for unknown bulb')
            throw 'unknown lightbulb'
        }

        const newBrightness = Math.max(0, Math.min(100, Math.round(brightness * 100)))
        await this.connection?.operateLight(light, {
            dimmer: newBrightness,
            onOff: newBrightness > 0
        })
    }

    async setLightTemperature(lightId: number, temp: number): Promise<void> {
        const light = this.lights.filter(light => light.instanceId === lightId)[0]
        if (!light) {
            this.logger.alert('cannot set temperature for unknown bulb')
            throw 'unknown lightbulb'
        }

        const spectrum = light.lightList[0]?.spectrum
        if (spectrum !== 'white') {
            this.logger.alert('temperature not supported by spectrum')
            throw 'temperature operation not supported'
        }

        const newTemp = Math.max(1, Math.min(100, Math.round(temp * 100)))
        await this.connection?.operateLight(light, {colorTemperature: newTemp})
    }

    async setLightColor(lightId: number, hexColor: string): Promise<void> {
        const light = this.lights.filter(light => light.instanceId === lightId)[0]
        if (!light) {
            this.logger.alert('cannot set temperature for unknown bulb')
            throw 'unknown lightbulb'
        }

        const spectrum = light.lightList[0]?.spectrum
        if (spectrum !== 'rgb') {
            this.logger.alert('color operation not supported by spectrum')
            throw 'color operation not supported'
        }
        await this.connection?.operateLight(light, {color: hexColor.replace('#', '')})
    }

    getScenes(): Array<SceneResponse> {
        return this.scenesUsageSorter.sort(this.scenes).map((scene: Scene) => ({
            name: scene.name,
            id: scene.instanceId
        }))
    }

    async setScene(sceneId: number): Promise<void> {
        if (!this.superGroup) {
            return
        }
        await this.connection?.operateGroup(this.superGroup, {sceneId}, true)
    }

    async restartGateway() {
        this.logger.alert('rebooting tradfri gateway')
        await this.connection?.rebootGateway()
    }

}
