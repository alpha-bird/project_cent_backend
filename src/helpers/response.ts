import { Response } from 'express';

import HttpException from '../exception/HttpException';

export const jsonResponse = (res: Response, error: HttpException, results: any): void => {
  if (error) {
    res.status(error.status || 500);
    res.set('Content-Type', 'application/json');
    res.send({ errors: [error.message] });
  } else {
    res.status(200);
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify({ results }));
  }
}

export const htmlResponse = (res: Response, error: HttpException, html: string): void => {
  if (error) {
    res.writeHead(error.status || 400, { 'Content-Type': 'text/html' });
    res.write(error);
    res.end();
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(html);
    res.end();
  }
}
