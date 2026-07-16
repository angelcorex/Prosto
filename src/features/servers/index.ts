/**
 * Public surface of the servers feature.
 *
 * Import from sub-modules only through this barrel so consumers stay
 * decoupled from the internal directory layout.
 */

// ── Shell / layout pieces ──────────────────────────────────────────────────
export { ServerRail }          from './server-rail';
export { ServerSidebar }       from './server-sidebar';
export { ServerSettings }      from './server-settings';
export { ServerHome }          from './server-home';
export { ServerEmojis }        from './server-emojis';

// ── Sub-domains ────────────────────────────────────────────────────────────
export { ChannelChat }         from './channels';
export type { ChannelChatProps, ChannelMessage } from './channels';

export { ServerMembersPanel }  from './members';

export { ServerDiscovery, CreateServerModal } from './discovery';

export { ServerInviteEmbed, inviteTokenOf } from './invites';

export {
  ServerRoles, MemberRoles, MemberRolePills, PermissionOverrideEditor,
  PERM, PERM_LIST, PERM_TREE, ROLE_COLORS, ROLE_GRADIENTS,
  hasPerm, roleNameStyle, roleNameClass,
} from './roles';
export type { PermKey, PermNode, PermGroup } from './roles';

export {
  MemberActionsMenu, ProfileModActions,
  CreateChannelModal, CreateCategoryModal, ServerInviteModal, ManageTarget,
  ModActionModal,
} from './moderation';
export type { ManageTargetSpec, ModAction, ModMember } from './moderation';

// ── Server actions (data layer) ────────────────────────────────────────────
export {
  createServer, createChannel, createCategory,
  deleteChannel, deleteCategory, renameChannel, renameCategory, reorderChannels,
  updateServer, updateServerSettings, removeMember,
  setServerVanity, checkServerVanity,
  deleteServer, leaveServer, uploadServerImage, uploadServerAsset,
  createServerInvite, acceptServerInvite, joinPublicServer,
  uploadChannelTheme, setChannelTheme,
  createRole, updateRole, deleteRole, uploadRoleIcon, reorderRoles, setMemberRoles,
  banMember, unbanMember, listServerBans,
  timeoutMember, removeTimeout, transferServerOwnership,
  listServerInvites, deleteServerInvite, setInvitesPaused, getInvitesPaused,
  markServerRead, setServerNotifySettings, type ServerNotifySettings,
} from './actions';
