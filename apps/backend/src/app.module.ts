import { AdminModule } from "./admin/admin.module";
import { LibraryModule } from "./library/library.module";
import { MediaModule } from "./media/media.module";
import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, "..", "..", "..", ".env"),
    }),
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
      exclude: ["/api/{*path}"],
    }),
    DatabaseModule,
    ConfigModule,
    LibraryModule,
    MediaModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
