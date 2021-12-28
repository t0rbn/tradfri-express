import {Service} from './Service'
import {Application, Request, Response} from 'express';
import LightsService from './LightsService.js';
import ServiceSingletonContainer from './util/ServiceSingletonContainer.js';

export default class AdminService implements Service {
    registerEndpoints(app: Application): void {
        app.get('/admin/restartSystemD', async (_req: Request, _res: Response) => {
            this.rebootSystemD();
            _res.sendStatus(200)
        })

        app.get('/admin/restartTradfriGateway', async (_req: Request, _res: Response) => {
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
