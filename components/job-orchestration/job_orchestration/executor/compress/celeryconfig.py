import os

from job_orchestration.scheduler.constants import SchedulerType, TASK_QUEUE_HIGHEST_PRIORITY

# Worker settings
# Force workers to consume only one task at a time
worker_prefetch_multiplier = 1
imports = [
    "job_orchestration.executor.compress.celery_compress",
]

# Queue settings
task_queue_max_priority = TASK_QUEUE_HIGHEST_PRIORITY
task_routes = {
    "job_orchestration.executor.compress.celery_compress.compress": SchedulerType.COMPRESSION,
}
task_create_missing_queues = True

# Worker-level task time limits. The scheduler-side staleness sweep is a backstop for the case
# where the worker pod is killed before it can honor these.
task_soft_time_limit = 540  # SIGUSR1 raises SoftTimeLimitExceeded inside the task
task_time_limit = 600  # SIGKILL the worker

# Results backend settings
result_persistent = True
result_expires = 7200

broker_url = os.getenv("BROKER_URL")
result_backend = os.getenv("RESULT_BACKEND")
