import { Test, TestingModule } from '@nestjs/testing';
import { ScannerService } from './scanner.service';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs';

describe('ScannerService', () => {
    let service: ScannerService;
    let mockDatabaseService: any;
    let mockPrepare: any;
    let mockRun: any;

    beforeEach(async () => {
        mockRun = jest.fn();
        mockPrepare = jest.fn().mockImplementation(() => ({
            run: mockRun,
        }));
        mockDatabaseService = {
            getDatabase: jest.fn().mockReturnValue({
                prepare: mockPrepare,
            })
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ScannerService,
                { provide: DatabaseService, useValue: mockDatabaseService }
            ],
        }).compile();

        service = module.get<ScannerService>(ScannerService);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('scanDirectory', () => {
        it('should recursively find video files and check stability', async () => {
            jest.spyOn(fs.promises, 'readdir').mockImplementation(async (path: string | Buffer | URL, options?: any) => {
                if (path === '/tmp/test') {
                    return [
                        { name: 'test.mp4', isDirectory: () => false, isFile: () => true },
                        { name: 'test.mkv', isDirectory: () => false, isFile: () => true },
                        { name: 'test.txt', isDirectory: () => false, isFile: () => true },
                        { name: 'subfol', isDirectory: () => true, isFile: () => false },
                    ] as any;
                } else if (path === '/tmp/test/subfol') {
                    return [
                        { name: 'subtest.avi', isDirectory: () => false, isFile: () => true },
                    ] as any;
                }
                return [];
            });

            jest.spyOn(fs.promises, 'stat').mockResolvedValue({ mtimeMs: 1000, size: 1024 } as any);

            const mockFd = {
                close: jest.fn().mockResolvedValue(undefined),
            };
            jest.spyOn(fs.promises, 'open').mockResolvedValue(mockFd as any);

            // Mock setTimeout to immediately execute
            jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => { cb(); return undefined as any; });

            const result = await service.scanDirectory('/tmp/test');

            expect(result.length).toBe(3);
            expect(result.some((f: any) => f.path.endsWith('/tmp/test/test.mp4'))).toBeTruthy();
            expect(result.some((f: any) => f.path.endsWith('/tmp/test/test.mkv'))).toBeTruthy();
            expect(result.some((f: any) => f.path.endsWith('/tmp/test/subfol/subtest.avi'))).toBeTruthy();
            expect(result.some((f: any) => f.path.endsWith('/tmp/test/test.txt'))).toBeFalsy();
            
            // Check read-only verification occurred
            expect(fs.promises.open).toHaveBeenCalledWith('/tmp/test/test.mp4', 'r');
        });
        
        it('should handle and log permission errors', async () => {
            jest.spyOn(fs.promises, 'readdir').mockRejectedValueOnce(new Error('EACCES'));
            
            const result = await service.scanDirectory('/tmp/forbidden');
            expect(result.length).toBe(0);
            expect(mockPrepare).toHaveBeenCalledWith("INSERT INTO scan_errors (file_path, error_type, error_message) VALUES (?, ?, ?)");
            expect(mockRun).toHaveBeenCalledWith('/tmp/forbidden', 'READDIR_ERROR', 'EACCES');
        });

        it('should skip unstable files', async () => {
            jest.spyOn(fs.promises, 'readdir').mockResolvedValueOnce([
                { name: 'downloading.mp4', isDirectory: () => false, isFile: () => true }
            ] as any);
            
            jest.spyOn(fs.promises, 'stat')
                .mockResolvedValueOnce({ mtimeMs: 1000, size: 1024 } as any)
                .mockResolvedValueOnce({ mtimeMs: 1000, size: 2048 } as any); // size changed
                
            jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => { cb(); return undefined as any; });
            
            const result = await service.scanDirectory('/tmp/downloads');
            expect(result.length).toBe(0);
        });
    });
});
