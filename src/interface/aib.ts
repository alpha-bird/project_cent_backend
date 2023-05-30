export enum ACCESS_LEVEL {
  ADMIN = 'ADMIN',
  NORMAL = 'NORMAL',
  RESTRICTED = 'RESTRICTED',
}

export enum TRANSFER_STATUS {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
};

export const TRANSFER_STATUS_CODE = {
  0: TRANSFER_STATUS.PENDING,
  1: TRANSFER_STATUS.COMPLETED,
  2: TRANSFER_STATUS.FAILED,
};

export enum PURCHASE_STATUS {
  CREATED = 'CREATED',      // payment intent created
  PENDING = 'PENDING',      // payment processing
  FAILED = 'FAILED',        // payment declined, can try again
  COMPLETED = 'COMPLETED',  // end state
  CANCELED = 'CANCELED',    // end state
};

export enum USER_STATUS {
  PEND = 'PEND',
  DFLT = 'DFLT',
  BNND = 'BNND',
  RSRT = 'RSRT', // restricted
};

export enum PHONE_VERIFICATION_STATUS {
  CREATED = 'CREATED',
  PASSED = 'PASSED',
};

export interface InboxMessageReturnType {
  id: string;
  create_date: string;
  read: boolean;
  creator_app_id: number;
  creator_profile_image: string;
  creator_subdomain: string;
  creator_name: string;
  creator_background_color: string;
  creator_secondary_color: string;
  postID: number;
  postTitle: string;
};

export enum NOTIFICATION_STATUS {
  UNREAD = 'unread',
  READ = 'read',
  DELETED = 'deleted',
};
