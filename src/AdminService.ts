import {Service} from './Service'
import {Application, Request, Response} from 'express';
import {generateEndpointUrl} from './Server.js';
import LightsService from './LightsService.js';
import ServiceSingletonContainer from './util/ServiceSingletonContainer.js';
import config from './Config.js'

export default class AdminService implements Service {
    registerEndpoints(app: Application): void {
        app.get(generateEndpointUrl(config.admin.apiEndpoint) + '/restartSystemD', async (_req: Request, _res: Response) => {
            this.rebootSystemD();
            _res.sendStatus(200)
        })

        app.get(generateEndpointUrl(config.admin.apiEndpoint)+ '/restartTradfriGateway', async (_req: Request, _res: Response) => {
            await this.rebootTradfriGateway();
            _res.sendStatus(200)
        })
    }

    rebootSystemD() {
        process.exit(1)
    }

    async rebootTradfriGateway() {
        await ServiceSingletonContainer.getService(LightsService)?.restartGateway();
    }
}
