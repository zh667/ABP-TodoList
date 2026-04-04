using TodoList.Localization;
using Volo.Abp.AspNetCore.Mvc;

namespace TodoList.Controllers;

/* Inherit your controllers from this class.
 */
public abstract class TodoListController : AbpControllerBase
{
    protected TodoListController()
    {
        LocalizationResource = typeof(TodoListResource);
    }
}
