﻿import { Environment } from './config.interface';
import { IsDefined, IsEnum, IsInt, IsOptional, IsPort, IsString, IsUrl, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(ConfigValidation, config, { enableImplicitConversion: true });

    const errors = validateSync(validatedConfig, { skipMissingProperties: false });

    if (errors.length > 0) throw new Error(errors.toString());

    return validatedConfig;
}

export class ConfigValidation {
    @IsEnum(Environment, {
        message: 'A valid (development, production, test) NODE_ENV environment variable must be set'
    })
    @IsDefined()
    NODE_ENV: Environment;

    @IsDefined()
    @IsInt()
    NODE_PORT: number;

    @IsDefined({
        message: 'A Steam API is needed to run this application, go grab on from https://steamcommunity.com/dev/apikey'
    })
    @IsString()
    STEAM_WEB_API_KEY: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    BASE_URL: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    API_URL: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    AUTH_URL: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    CDN_URL: string;

    @IsOptional()
    @IsUrl()
    SENTRY_DSN: string;
}