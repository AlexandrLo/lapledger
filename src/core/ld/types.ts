export type LdHeader = {
  channelMetaPtr: number;
  channelDataPtr: number;
  eventPtr: number;
  channelCount: number;
  deviceSerial: number;
  deviceType: string;
  deviceVersion: number;
  date: string;
  time: string;
  driver: string;
  vehicle: string;
  venue: string;
  shortComment: string;
  eventName: string;
  sessionName: string;
};

export type LdChannel = {
  name: string;
  shortName: string;
  unit: string;
  freq: number;
  count: number;
  dataPtr: number;
  dtypeA: number;
  dtype: number;
  shift: number;
  mul: number;
  scale: number;
  dec: number;
};
