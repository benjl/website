import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaService } from '@modules/repo/prisma.service';
import { AppModule } from './app.module';
import {
    ClassSerializerInterceptor,
    INestApplication,
    NestApplicationOptions,
    ValidationPipe,
    ValidationPipeOptions
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';

export const appOptions: NestApplicationOptions = {
    // Disable bodyParser - we handle body parsing middlewares explicitly.
    bodyParser: false
};

/* Transforms `BigInt`s to strings in JSON.stringify, for cases that haven't been explicitly
 * transformed to numbers using @NumberifyBigInt().
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
 */
export function jsonBigIntFix() {
    BigInt.prototype['toJSON'] = function () {
        return this.toString();
    };
}

export async function setupNestApplication(app: INestApplication, validationOptions: ValidationPipeOptions) {
    app.useGlobalPipes(new ValidationPipe(validationOptions));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

    // For some reason this doesn't exclude 'auth' properly. Messed with it a while and got nowhere.
    // app.setGlobalPrefix('api', { exclude: ['auth'] });

    const prismaDalc: PrismaService = app.get(PrismaService);
    await prismaDalc.enableShutdownHooks(app);
}

// TODO: If we move to ES Modules we can use top-level await and ditch the IIFE.
(async () => {
    jsonBigIntFix();

    const app: NestExpressApplication = await NestFactory.create(AppModule, appOptions);

    app.useStaticAssets(join(__dirname, 'assets/'));

    await setupNestApplication(
        app,
        // Forbidding unknown values here ensures any request containing unexpected data on the query/body (i.e. does not
        // have validators) will fail. Our tests even more strict: passing an unexpected value will throw an error.
        // In effect, you MUST include validation decorators.
        { transform: true, forbidUnknownValues: true }
    );

    const swaggerConfig = new DocumentBuilder()
        .setTitle('Momentum Mod API')
        .setDescription('The Momentum Mod API - https://github.com/momentum-mod/website')
        .addBearerAuth()
        .setVersion('1.0')
        .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, swaggerDocument, {
        customSiteTitle: 'Momentum Mod API Docs',
        customfavIcon: '../favicon.ico',
        swaggerOptions: {
            persistAuthorization: true
        }
    });

    const configService = app.get(ConfigService);
    const port = configService.get('port');

    await app.listen(port);
    // TODO: For some insane fucking reason, this file needs to call app.init() instead of listen() for TESTS to
    // terminate properly. Why is test initialisation affected by this file, when they're initialised from environment.ts?
    // I have no fucking idea!! Leaving for now, Fastify may change stuff idk.
    // await app.init();
})();
