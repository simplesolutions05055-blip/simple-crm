revoke execute on function crm_link_member() from public, anon, authenticated;
revoke execute on function crm_is_member(uuid) from public, anon;
grant execute on function crm_is_member(uuid) to authenticated;
