import { formatDistanceToNowStrict, format } from 'date-fns';

export const deadlineLabel=(iso:string)=>formatDistanceToNowStrict(new Date(iso),{addSuffix:false});
export const timeLabel=(iso:string)=>format(new Date(iso),'h:mm a');
export const dateHeading=(d=new Date())=>format(d,'EEEE, MMMM d');
export const dateLabel=(iso:string)=>format(new Date(iso),'MMM d, yyyy');
export const shortDateLabel=(iso:string)=>format(new Date(iso),'MMM d');
