import type { ChannelType } from '@/types/api';

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  email: '邮件',
  webhook: 'Webhook',
  wecom: '企业微信',
  dingtalk: '钉钉',
  feishu: '飞书',
};
