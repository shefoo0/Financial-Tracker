// Every "Unlock Pro" button opens the Pro screen (milestone 4), where Pro can be bought or restored.
import { router } from 'expo-router';

export const PRO_ROUTE = '/pro';
export const showPro = () => router.push(PRO_ROUTE);
