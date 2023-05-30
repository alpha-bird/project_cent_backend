import { Response } from 'express';

class Home {
  public static index (req: AIB.IRequest, res: Response): void {
    const initialState = {
      _route: 'home',
      _content: `AIB Server`
    };

    return res.render('html', { data: initialState });
  }
}

export default Home;
