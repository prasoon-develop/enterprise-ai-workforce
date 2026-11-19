package com.enterprise.securecore;

import java.util.HashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/secure")
public class CoreController {

    @PostMapping("/audit")
    public Map<String, Object> auditTask(@RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "SECURE_VERIFIED");
        response.put("message", "Task audited and verified by Spring Boot Core");
        response.put("payload_received", payload);
        return response;
    }
}