import SalesforceConnection  from 'node-salesforce-connection';

export enum ACCOUNT_TYPE {
  Subscriber    = 'Subscriber',
  Creator       = 'Creator',
  Beta          = 'Beta'
}

export interface ISalesforceAccount {
  Cent_ID__c?: string;
  Stripe_ID__c?: string;
  App_ID__pc?: string;
  PersonEmail?: string;
  LastName?: string;
  Create_Date_For_User__pc?: string;
  Blockchain_Address__pc?: string;
  Account_Type__c?: ACCOUNT_TYPE;
  Subdomain__pc?: string;
  pages_url__pc?: string;
  Pages_User_Display_Name__pc?: string;
  App_Status_CONF__pc?: string;
  App_Status_SUB__pc?: string;
  App_Status_STYLED__pc?: string;
  App_Status_ACTIVE__pc?: string;
  Date_of_Last_Email_Import__pc?: string;
  Number_of_Emails_Last_Imported__pc?: number;
  Date_of_Last_Post__pc?: string;
  Payment_Country__pc?: string;
  Payment_Currency__pc?: string;
  Payment_Email__pc?: string;
  Payment_Signup_Date__pc?: string;
  Payment_Account_Status__pc?: string;
  Total_Number_of_pages_Posts__pc?: number;
  Total_Number_of_Subscribers__pc?: number;
  Total_Sales__pc?: number;
  Total_Units_Sold__pc?: number;
}

export class Salesforce {
  private envs: AIB.IEnvironment;
  private sfConnection: SalesforceConnection;
  private initialized: boolean;

  constructor (envs: AIB.IEnvironment) {
    this.envs = envs;
  }

  public async initialize(): Promise<boolean> {
    try {
      const sfConnectionInstance = new SalesforceConnection();
      const {
        salesforceHost,
        salesforceClientId,
        salesforceClientSecret,
        salesforceUser,
        salesforcePassword
      } = this.envs;
      const tokenRequest = {
        grant_type: "password",
        client_id: salesforceClientId,
        client_secret: salesforceClientSecret,
        username: salesforceUser,
        password: salesforcePassword,
      };
  
      await sfConnectionInstance.oauthToken(salesforceHost, tokenRequest);
  
      this.sfConnection = sfConnectionInstance;
      this.initialized = true;

      return true;
    } catch (error) {
      console.error(error);

      this.initialized = false;
      return false;
    }
  }

  public resetToken(): void {
    this.sfConnection = null;
    this.initialized = false;
  }

  public async createAccountRecord(newRecord: ISalesforceAccount): Promise<void> {
    if (!this.initialized) {
      const isSuccess: boolean = await this.initialize();
      if (!isSuccess) throw new Error('Authentication failed!');
    }

    const result = await this.sfConnection.rest("/services/data/v53.0/sobjects/Account",
      {
        method: "POST",
        body: newRecord
      }
    );

    return result;
  }

  public async getAccountRecord(userId: string): Promise<ISalesforceAccount> {
    try {
      if (!this.initialized) {
        const isSuccess: boolean = await this.initialize();
        if (!isSuccess) throw new Error('Authentication failed!');
      }
  
      const result = await this.sfConnection.rest(`/services/data/v53.0/sobjects/Account/Cent_ID__c/${userId}`,
        {
          method: "GET",
        }
      );
  
      return result;
    } catch (error) {
      if (error.message === 'NOT_FOUND: The requested resource does not exist' || 
        error.message === 'NOT_FOUND: Provided external ID field does not exist or is not accessible: Cent_ID__c') {
        return null;
      } else {
        throw error;
      }
    }
  }

  public async getAccountRecordByStripeId(stripeId: string): Promise<ISalesforceAccount> {
    try {
      if (!this.initialized) {
        const isSuccess: boolean = await this.initialize();
        if (!isSuccess) throw new Error('Authentication failed!');
      }
  
      const result = await this.sfConnection.rest(`/services/data/v53.0/sobjects/Account/Stripe_ID__c/${stripeId}`,
        {
          method: "GET",
        }
      );
  
      return result;
    } catch (error) {
      if (error.message === 'NOT_FOUND: The requested resource does not exist') {
        return null;
      } else {
        throw error;
      }
    }
  }

  public async updateAccountRecord(userId: string, updates: ISalesforceAccount): Promise<void> {
    if (!this.initialized) {
      const isSuccess: boolean = await this.initialize();
      if (!isSuccess) throw new Error('Authentication failed!');
    }

    const result = await this.sfConnection.rest(`/services/data/v53.0/sobjects/Account/Cent_ID__c/${userId}`,
      {
        method: "PATCH",
        body: updates,
      }
    );

    return result;
  }

  public async updateAccountRecordByStripeId(stripeId: string, updates: ISalesforceAccount): Promise<void> {
    if (!this.initialized) {
      const isSuccess: boolean = await this.initialize();
      if (!isSuccess) throw new Error('Authentication failed!');
    }

    const result = await this.sfConnection.rest(`/services/data/v53.0/sobjects/Account/Stripe_ID__c/${stripeId}`,
      {
        method: "PATCH",
        body: updates,
      }
    );

    return result;
  }
}
