package com.bizzskill.portal.user.dto;

/**
 * The result of creating an account.
 *
 * @param user              the account as created, without any credential.
 * @param temporaryPassword the generated password, present <em>only</em> when the
 *                          caller did not supply one. This is the single moment it
 *                          can ever be read: it is stored unmasked for now, but no
 *                          endpoint returns it again, so the administrator has to
 *                          pass it on there and then.
 */
public record CreatedUserResponse(PortalUserResponse user, String temporaryPassword) {
}
