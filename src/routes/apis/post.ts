import PostController from '../../controllers/Api/Post';
import { isAppUser, restrictAccess, isUserBanned } from '../../middlewares/Auth';
import { limitRegion } from '../../middlewares/Geo';
import { API_METHOD } from '../../interface/app';

const postRoutes: AIB.Route[] = [
  {
    path: '/_/post',
    method: API_METHOD.GET,
    handler: PostController.getPosts,
  },
  {
    path: '/_/post/app',
    method: API_METHOD.GET,
    handler: PostController.getAppPosts,
  },
  {
    path: '/_/post/global',
    method: API_METHOD.GET,
    handler: PostController.getGlobalPosts,
  },
  {
    path: '/_/post',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned],
    handler: PostController.createPost,
  },
  {
    path: '/_/post-draft/:uuid',
    method: API_METHOD.GET,
    handler: PostController.getPostDraft,
  },
  {
    path: '/_/post/:id',
    method: API_METHOD.GET,
    handler: PostController.getPost,
  },
  {
    path: '/_/post/:id/collectors',
    method: API_METHOD.GET,
    handler: PostController.getPostCollectors,
  },
  {
    path: '/_/post/:id/collectors/export',
    method: API_METHOD.GET,
    handler: PostController.exportPostCollectors,
  },
  {
    path: '/_/post/:id/deactivate',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess],
    handler: PostController.deactivatePost,
  },
  {
    path: '/_/post/:postID/show',
    method: API_METHOD.PUT,
    middlewares: [isAppUser, restrictAccess],
    handler: PostController.showPost,
  },
  {
    path: '/_/post/:postID/hide',
    method: API_METHOD.PUT,
    middlewares: [isAppUser, restrictAccess],
    handler: PostController.hidePost,
  },
  {
    path: '/_/post/test',
    method: API_METHOD.POST,
    handler: PostController.testPost,
  },
  {
    path: '/_/post/store',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned],
    handler: PostController.storePost,
  },
  {
    path: '/_/post/claim',
    method: API_METHOD.POST,
    middlewares: [isAppUser, restrictAccess, isUserBanned, limitRegion],
    handler: PostController.claimPost,
  }
];

export default postRoutes;
