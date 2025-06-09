import { Readable } from 'stream';
import * as csv from 'csv-parse';

export async function parseCsv(csvData: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    const stream = Readable.from(csvData);

    stream
      .pipe(csv.parse({ columns: true }))
      .on('data', (row) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}