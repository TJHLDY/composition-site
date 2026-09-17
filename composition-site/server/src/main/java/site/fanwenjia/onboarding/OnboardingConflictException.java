package site.fanwenjia.onboarding;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class OnboardingConflictException extends ResponseStatusException {

    OnboardingConflictException(String reason) {
        super(HttpStatus.CONFLICT, reason);
    }
}
