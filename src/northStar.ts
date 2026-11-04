import { useQuery } from '@tanstack/react-query';
import { supabase } from './lib/supabase';
import { useAuth } from './lib/AuthContext';
import { queryClient } from './lib/queryClient';
import type { TaskDomain } from './db';

export interface NorthStarCard {
  id: string; user_id: string; kind: 'vision' | 'card'; title: string;
  vision: string; why: string; ideas: string; domain: TaskDomain;
  source_task_id: string | null; sort_order: number; revision: number;
}
export function useNorthStar() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['northStar', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('north_star').select('*').eq('user_id', user!.id).order('sort_order').order('id');
      if (error) throw new Error(error.message);
      return data as NorthStarCard[];
    },
  });
}
export async function saveNorthStar(card: NorthStarCard, isNew: boolean) {
  if (!card.title.trim() || !card.vision.trim()) throw new Error('Give your vision a title and a description.');
  const fields = {title:card.title.trim(), vision:card.vision.trim(), why:card.why, ideas:card.ideas, domain:card.domain};
  const result = isNew
    ? await supabase.from('north_star').insert({...card,...fields}).select().single()
    : await supabase.from('north_star').update({...fields, revision:card.revision+1}).eq('id',card.id).eq('user_id',card.user_id).eq('revision',card.revision).select().maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error('This card changed in another window. Close the editor and refresh before editing again.');
  await queryClient.invalidateQueries({queryKey:['northStar']});
}
