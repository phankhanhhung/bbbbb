import { useCallback, useState } from 'preact/hooks';
import { formatProblem, type Problem } from '@combviz/schema';

/**
 * Mở và ghi file bài trực tiếp trên đĩa (AUT-06).
 *
 * File System Access API khi có, upload/download khi không. Đường FSA là đường
 * chính vì nó cho phép **ghi đè đúng file trong repo**: soạn xong bấm Lưu, rồi
 * `git diff` ngay — không có bước tải về rồi kéo vào thư mục, mà bước đó là chỗ
 * hay quên nhất trong mọi quy trình soạn nội dung.
 *
 * Luôn ghi qua `formatProblem` (DAT-03): Studio không được là nguồn tạo ra những
 * diff xáo trộn cả file chỉ vì sửa một chữ.
 */
export interface ProblemFile {
  readonly problem: Problem | null;
  readonly name: string | null;
  readonly dirty: boolean;
  readonly error: string | null;
  readonly canWriteBack: boolean;
  open(): Promise<void>;
  openUpload(file: File): Promise<void>;
  update(next: Problem): void;
  save(): Promise<void>;
  download(): void;
}

interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

export function useProblemFile(): ProblemFile {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [handle, setHandle] = useState<FileHandleLike | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = typeof (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';

  const open = useCallback(async () => {
    setError(null);
    try {
      const picker = (globalThis as unknown as {
        showOpenFilePicker(options: unknown): Promise<FileHandleLike[]>;
      }).showOpenFilePicker;

      const [picked] = await picker({
        types: [{ description: 'CombViz problem', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      if (!picked) return;

      const file = await picked.getFile();
      setProblem(JSON.parse(await file.text()) as Problem);
      setHandle(picked);
      setName(picked.name);
      setDirty(false);
    } catch (cause) {
      // Người dùng bấm Huỷ trong hộp thoại cũng ném — đó không phải lỗi.
      if ((cause as Error).name === 'AbortError') return;
      setError((cause as Error).message);
    }
  }, []);

  const openUpload = useCallback(async (file: File) => {
    setError(null);
    try {
      setProblem(JSON.parse(await file.text()) as Problem);
      setHandle(null);
      setName(file.name);
      setDirty(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  const update = useCallback((next: Problem) => {
    setProblem(next);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!problem || !handle) return;
    const writable = await handle.createWritable();
    await writable.write(formatProblem(problem));
    await writable.close();
    setDirty(false);
  }, [problem, handle]);

  const download = useCallback(() => {
    if (!problem) return;
    const blob = new Blob([formatProblem(problem)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${problem.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [problem]);

  return {
    problem,
    name,
    dirty,
    error: error ?? (supported ? null : null),
    canWriteBack: handle !== null,
    open,
    openUpload,
    update,
    save,
    download,
  };
}

export const FILE_SYSTEM_SUPPORTED =
  typeof (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
