-- "Zerar personagem" com conta não zerava (auditoria 23/10): player_saves não tinha regra de DELETE
-- (só SELECT/INSERT/UPDATE) → o banco recusava calado e, ao recarregar, o personagem antigo voltava.
-- Cada usuário pode apagar SOMENTE o próprio save.
drop policy if exists player_saves_delete_own on public.player_saves;
create policy player_saves_delete_own on public.player_saves
  for delete to authenticated
  using (auth.uid() = user_id);
