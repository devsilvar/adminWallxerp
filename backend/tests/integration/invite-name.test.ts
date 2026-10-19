import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { testDb, createTestUser, createTestBusiness } from '../helpers/test-db';
import * as teamService from '../../src/services/team/team.service';

describe('Invitee Name Capture & Security Trust Boundary', () => {
  let ownerId: string;
  let businessId: string;
  let businessTamperId: string;
  let businessEditId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const owner = await createTestUser(`name-owner-${Date.now()}@test.com`);
    createdUserIds.push(owner.id);
    ownerId = owner.id;

    const business = await createTestBusiness(owner.id, 'Name Test SME Ltd');
    businessId = business.id;

    const businessTamper = await createTestBusiness(owner.id, 'Name Test Tamper SME');
    businessTamperId = businessTamper.id;

    const businessEdit = await createTestBusiness(owner.id, 'Name Test Edit SME');
    businessEditId = businessEdit.id;
  }, 60000);

  afterAll(async () => {
    // Targeted cleanup of test records created in this file
    try {
      await testDb.invitation.deleteMany({
        where: { businessId: { in: [businessId, businessTamperId, businessEditId] } },
      });
      await testDb.businessMember.deleteMany({
        where: { businessId: { in: [businessId, businessTamperId, businessEditId] } },
      });
      await testDb.business.deleteMany({
        where: { id: { in: [businessId, businessTamperId, businessEditId] } },
      });
      if (createdUserIds.length > 0) {
        await testDb.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
    } catch {
      // Ignore cleanup errors
    } finally {
      await testDb.$disconnect();
    }
  }, 60000);

  test('inviteMember persists and returns trimmed fullName', async () => {
    const inviteEmail = `invitee-${Date.now()}@test.com`;
    const res = await teamService.inviteMember(ownerId, businessId, {
      email: inviteEmail,
      fullName: '  Fatima Abubakar  ',
      role: 'accountant',
    });

    expect(res.invitation.email).toBe(inviteEmail.toLowerCase());
    expect(res.invitation.fullName).toBe('Fatima Abubakar');

    // Verify in DB directly
    const dbInvite = await testDb.invitation.findUnique({
      where: { id: res.invitation.id },
    });
    expect(dbInvite?.fullName).toBe('Fatima Abubakar');
  }, 60000);

  test('inviteMember allows omitting fullName for backward compatibility', async () => {
    const inviteEmail = `invitee-noname-${Date.now()}@test.com`;
    const res = await teamService.inviteMember(ownerId, businessId, {
      email: inviteEmail,
      role: 'viewer',
    });

    expect(res.invitation.email).toBe(inviteEmail.toLowerCase());
    expect(res.invitation.fullName).toBeNull();
  }, 60000);

  test('validateInviteToken returns fullName for valid token and null for invalid token', async () => {
    const inviteEmail = `invitee-val-${Date.now()}@test.com`;
    const res = await teamService.inviteMember(ownerId, businessId, {
      email: inviteEmail,
      fullName: 'Babatunde Fashola',
      role: 'sales_staff',
    });

    const rawToken = res.meta?.rawToken;
    expect(rawToken).toBeDefined();

    const validation = await teamService.validateInviteToken(rawToken!);
    expect(validation.valid).toBe(true);
    expect(validation.fullName).toBe('Babatunde Fashola');
    expect(validation.email).toBe(inviteEmail.toLowerCase());

    const badValidation = await teamService.validateInviteToken('invalid-token-12345');
    expect(badValidation.valid).toBe(false);
    expect(badValidation.fullName).toBeNull();
  }, 60000);

  test('R-4 Security Boundary: acceptOnboardingInvite uses Invitation fullName, IGNORING client body', async () => {
    const inviteEmail = `invitee-tamper-${Date.now()}@test.com`;
    const res = await teamService.inviteMember(ownerId, businessTamperId, {
      email: inviteEmail,
      fullName: 'Ngozi Okonjo',
      role: 'manager',
    });

    const rawToken = res.meta?.rawToken;
    expect(rawToken).toBeDefined();

    // Client attempts to tamper with fullName in request body
    const forgedInput: any = {
      token: rawToken!,
      password: 'Password123!',
      fullName: 'Mallory Hacker',
    };

    const acceptRes = await teamService.acceptOnboardingInvite(forgedInput);
    expect(acceptRes.user.email).toBe(inviteEmail.toLowerCase());
    expect(acceptRes.user.fullName).toBe('Ngozi Okonjo'); // Sourced from invitation, NOT "Mallory Hacker"!
    createdUserIds.push(acceptRes.user.id);

    // Verify in DB directly
    const createdUser = await testDb.user.findUnique({
      where: { id: acceptRes.user.id },
    });
    expect(createdUser?.fullName).toBe('Ngozi Okonjo');

    // Verify permissions.memberName also matches the admin-attested name
    const membership = await testDb.businessMember.findUnique({
      where: { id: acceptRes.membership.id },
    });
    expect((membership?.permissions as any)?.memberName).toBe('Ngozi Okonjo');

    // Check listTeam on businessTamper returns the accepted user with full name
    const teamTamper = await teamService.listTeam(ownerId, businessTamperId);
    const ngoziMember = teamTamper.members.find((m) => m.user.fullName === 'Ngozi Okonjo');
    expect(ngoziMember).toBeDefined();
    expect(ngoziMember?.user.fullName).toBe('Ngozi Okonjo');
  }, 60000);

  test('listTeam includes fullName in pendingInvitations', async () => {
    const team = await teamService.listTeam(ownerId, businessId);
    expect(team.pendingInvitations.length).toBeGreaterThan(0);

    const namedInvite = team.pendingInvitations.find((i) => i.fullName === 'Fatima Abubakar');
    expect(namedInvite).toBeDefined();
    expect(namedInvite?.fullName).toBe('Fatima Abubakar');
  }, 60000);

  test('Owner can update own fullName and syncs to business.ownerName', async () => {
    const team = await teamService.listTeam(ownerId, businessEditId);
    const ownerMember = team.members.find((m) => m.role === 'owner');
    expect(ownerMember).toBeDefined();

    const res = await teamService.updateMemberRole(ownerId, businessEditId, ownerMember!.id, {
      fullName: 'Chief Aliko Dangote',
    });

    expect(res.user.fullName).toBe('Chief Aliko Dangote');

    // Verify user table updated
    const user = await testDb.user.findUnique({ where: { id: ownerId } });
    expect(user?.fullName).toBe('Chief Aliko Dangote');

    // Verify business.ownerName synced
    const biz = await testDb.business.findUnique({ where: { id: businessEditId } });
    expect(biz?.ownerName).toBe('Chief Aliko Dangote');
  }, 60000);

  test('Owner can update another member fullName', async () => {
    // Invite a member
    const staffEmail = `staff-${Date.now()}@test.com`;
    const invite = await teamService.inviteMember(ownerId, businessEditId, {
      email: staffEmail,
      fullName: 'Old Staff Name',
      role: 'sales_staff',
    });
    const accepted = await teamService.acceptOnboardingInvite({
      token: invite.meta!.rawToken!,
      password: 'Password123!',
    });
    createdUserIds.push(accepted.user.id);

    const res = await teamService.updateMemberRole(ownerId, businessEditId, accepted.membership.id, {
      fullName: 'Updated Staff Name',
    });

    expect(res.user.fullName).toBe('Updated Staff Name');

    // Verify listTeam returns updated full name
    const team = await teamService.listTeam(ownerId, businessEditId);
    const updatedMember = team.members.find((m) => m.userId === accepted.user.id);
    expect(updatedMember?.user.fullName).toBe('Updated Staff Name');
  }, 60000);

  test('Team member can update their own fullName without team.manage permission', async () => {
    const viewerEmail = `viewer-${Date.now()}@test.com`;
    const invite = await teamService.inviteMember(ownerId, businessEditId, {
      email: viewerEmail,
      fullName: 'Initial Viewer',
      role: 'viewer',
    });
    const accepted = await teamService.acceptOnboardingInvite({
      token: invite.meta!.rawToken!,
      password: 'Password123!',
    });
    createdUserIds.push(accepted.user.id);

    // Viewer calls updateMemberRole on themselves
    const res = await teamService.updateMemberRole(accepted.user.id, businessEditId, accepted.membership.id, {
      fullName: 'Self Renamed Viewer',
    });

    expect(res.user.fullName).toBe('Self Renamed Viewer');

    const dbUser = await testDb.user.findUnique({ where: { id: accepted.user.id } });
    expect(dbUser?.fullName).toBe('Self Renamed Viewer');
  }, 60000);

  test('Non-manager member cannot edit another member name', async () => {
    const team = await teamService.listTeam(ownerId, businessEditId);
    const ownerMember = team.members.find((m) => m.role === 'owner');
    const viewerMember = team.members.find((m) => m.role === 'viewer');
    expect(viewerMember).toBeDefined();

    // Viewer tries to edit owner's name
    await expect(
      teamService.updateMemberRole(viewerMember!.userId, businessEditId, ownerMember!.id, {
        fullName: 'Hacked Name',
      })
    ).rejects.toThrow();
  }, 60000);

  test('Manager cannot edit owner name', async () => {
    const separateBiz = await createTestBusiness(ownerId, 'Manager Test SME');
    const managerEmail = `mgr-${Date.now()}@test.com`;
    const invite = await teamService.inviteMember(ownerId, separateBiz.id, {
      email: managerEmail,
      fullName: 'Test Manager',
      role: 'manager',
    });
    const acceptedMgr = await teamService.acceptOnboardingInvite({
      token: invite.meta!.rawToken!,
      password: 'Password123!',
    });
    createdUserIds.push(acceptedMgr.user.id);

    const team = await teamService.listTeam(ownerId, separateBiz.id);
    const ownerMember = team.members.find((m) => m.role === 'owner');

    await expect(
      teamService.updateMemberRole(acceptedMgr.user.id, separateBiz.id, ownerMember!.id, {
        fullName: 'Manager Trying To Rename Owner',
      })
    ).rejects.toThrow();

    // Cleanup separateBiz
    await testDb.invitation.deleteMany({ where: { businessId: separateBiz.id } });
    await testDb.businessMember.deleteMany({ where: { businessId: separateBiz.id } });
    await testDb.business.deleteMany({ where: { id: separateBiz.id } });
  }, 60000);
});
