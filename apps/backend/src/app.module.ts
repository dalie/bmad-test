import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser'),
      exclude: ['/api/(.*)'],
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
