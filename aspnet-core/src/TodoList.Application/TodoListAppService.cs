using System;
using System.Collections.Generic;
using System.Text;
using TodoList.Localization;
using Volo.Abp.Application.Services;

namespace TodoList;

/* Inherit your application services from this class.
 */
public abstract class TodoListAppService : ApplicationService
{
    protected TodoListAppService()
    {
        LocalizationResource = typeof(TodoListResource);
    }
}
