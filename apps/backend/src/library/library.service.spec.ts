import { Test, TestingModule } from "@nestjs/testing";
import { LibraryService } from "./library.service";
import { DatabaseService } from "../database/database.service";
import { ScannerService } from "./scanner.service";

describe("LibraryService", () => {
  let service: LibraryService;
  let mockDbService: any;
  let mockScanner: any;
  let mockTransaction: jest.Mock;

  beforeEach(async () => {
    mockTransaction = jest.fn((cb) => {
      const wrappedFn = () => cb();
      return wrappedFn;
    });
    mockDbService = {
      getDatabase: jest.fn().mockReturnValue({
        prepare: jest.fn().mockImplementation((query: string) => {
          return {
            all: jest.fn().mockReturnValue([]),
            get: jest.fn().mockReturnValue({ total: 0 }),
            run: jest.fn(),
          };
        }),
        transaction: mockTransaction,
      }),
    };
    mockScanner = {
      scanDirectory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: ScannerService, useValue: mockScanner },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("syncFiles", () => {
    it("should insert new files and mark missing files", () => {
      const mockRunFn = jest.fn();
      const mockAllFn = jest
        .fn()
        .mockReturnValueOnce([
          {
            id: 1,
            path: "/tmp/old.mp4",
            filename: "old.mp4",
            size: 50,
            mtime: 500,
            status: "discovered",
          },
        ])
        .mockReturnValue([]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn().mockReturnValue({ total: 0 }),
        run: mockRunFn,
      });

      const scannedFiles = [
        {
          path: "/tmp/new.mp4",
          filename: "new.mp4",
          stats: { size: 100, mtimeMs: 1000 } as any,
        },
      ];

      service.syncFiles(1, scannedFiles);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Verify the transaction body was executed (insert for new file + mark missing for old)
      expect(mockRunFn).toHaveBeenCalled();
    });

    it("should flag modified files when size or mtime change", () => {
      const mockRunFn = jest.fn();
      const mockAllFn = jest
        .fn()
        .mockReturnValueOnce([
          {
            id: 1,
            path: "/tmp/video.mp4",
            filename: "video.mp4",
            size: 50,
            mtime: 500,
            status: "discovered",
          },
        ]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn().mockReturnValue({ total: 0 }),
        run: mockRunFn,
      });

      const scannedFiles = [
        {
          path: "/tmp/video.mp4",
          filename: "video.mp4",
          stats: { size: 200, mtimeMs: 2000 } as any,
        },
      ];

      service.syncFiles(1, scannedFiles);
      expect(mockDb.transaction).toHaveBeenCalled();
      // flagModifiedStmt should have been called with new size, mtime, and id
      expect(mockRunFn).toHaveBeenCalledWith(200, 2000, 1);
    });
  });

  describe("startScan", () => {
    it("should return a scan ID and create a scan record", () => {
      const scanId = service.startScan(false);
      expect(scanId).toBeDefined();
      const status = service.getScanStatus(scanId);
      expect(status).toBeDefined();
      expect(status!.id).toBe(scanId);
      expect(status!.startedAt).toBeDefined();
    });
  });

  describe("getFiles", () => {
    it("should return paginated files", () => {
      const result = service.getFiles(0, 10);
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("offset", 0);
      expect(result).toHaveProperty("limit", 10);
    });
  });
});
