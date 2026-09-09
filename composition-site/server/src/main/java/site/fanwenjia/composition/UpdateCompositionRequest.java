package site.fanwenjia.composition;

public record UpdateCompositionRequest(String title, String sourceLabel, String content, Integer contentVersion) {}
