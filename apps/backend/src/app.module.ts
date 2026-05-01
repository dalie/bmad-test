import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(
        __dirname,
        "..",
        "..",
        "frontend",
        "dist",
        "frontend",
        "browser",
      ),
      exclude: ["/api/(.*)"],
    }),
    DatabaseModule,
    ConfigModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
