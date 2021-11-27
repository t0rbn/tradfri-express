import express, {Request, Response} from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import config from './Config.js'

import LightsService from './LightsService.js'
import Logger from './util/Logger.js'
import AdminService from './AdminService.js';

import ServiceSingletonContainer from './util/ServiceSingletonContainer.js';
import {Service} from './Service';

function start() {
    const logger = new Logger('server')
    logger.log('starting up')

    logger.log('creating express instance')
    const app = express()
    app.use(bodyParser.text())
    app.use(cors())

    logger.log('creating services')
    ServiceSingletonContainer.registerService(new LightsService());
    ServiceSingletonContainer.registerService(new AdminService());

    logger.log('registering service endpoints')
    ServiceSingletonContainer.getAllServices().forEach((service: Service) => service.registerEndpoints(app));

    app._router.stack.forEach((layer: any) => {
        if (layer.route?.path) {
            logger.log(`registered path ${layer.route.path}`)
        }
    })

    app.get(config.server.apiBaseUrl, async (_req: Request, _res: Response) => {
        _res.send(app._router.stack.map((layer: any) => layer.route?.path).filter(Boolean))
    })

    app.use(express.static('client'))
    app.listen(config.server.port, () => logger.log(`started on port ${config.server.port}`))
}

start();
