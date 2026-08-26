# Glossary

```{glossary}
CLP deployment
    An instance of the CLP package deployed through the Cloud Console.

Deployment action
    An operation that changes a deployment. Supported actions include create, delete, suspend,
    resume, and configure.

Deployment request
    A request to perform a deployment action.

Deployment orchestrator
    The Cloud Console component that schedules and executes deployment requests. It processes
    requests fairly across tenants and records their results in the Cloud Console's metadata store
    (MongoDB).

Tenant
    A customer. Deployment requests for a customer are grouped together.
```
