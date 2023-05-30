import { Response } from 'express';

class HomeController {
  public static async index(req: AIB.IRequest, res: Response): Promise<void> {
    res.status(200).send({ name: 'AIB Server' });
  }
}

export default HomeController;
