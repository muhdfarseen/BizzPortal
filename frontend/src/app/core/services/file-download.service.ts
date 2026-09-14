import { Injectable } from '@angular/core';

/** MIME type used for the CSV reports and templates. */
export const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

/**
 * Hands generated text files to the browser as downloads.
 *
 * A service rather than a free function so specs can stub it: jsdom has no
 * `URL.createObjectURL`, and asserting a real download is not the point of a
 * component test.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  /** Downloads `content` as `fileName`. */
  download(fileName: string, content: string, mimeType: string = CSV_MIME_TYPE): void {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
