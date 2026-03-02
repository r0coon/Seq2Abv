import type { CreateModalConfig }  from './builders/modal';
import type { MessageType }        from './builders/template';


export interface ClosePermissions {
  everyone: boolean;
  roles:    string[];
}

export interface CategoryConfig {
  label?:              string;
  emoji?:              string;
  channelName:         string;
  categoryId:          string;
  staffRoleId:         string;
  maxOpenPerUser:      number;
  closePermissions:    ClosePermissions;
  requireCloseReason?: boolean;
  createModal?:        CreateModalConfig;
  subCategoryDir?:     string;
  message: {
    type:      MessageType;
    greeting?: string;
    body?:     string;
  };
}

export interface SubCategoryConfig {
  label:        string;
  emoji?:       string;
  description?: string;
  channelName?: string;
  staffRoleId?: string;
  categoryId?:  string;
  modal?:       CreateModalConfig;
}

export interface GeneralConfig {
  panelChannelId:      string;
  logChannelId:        string;
  transcriptChannelId: string;
  archiveCategoryId:   string;
}
